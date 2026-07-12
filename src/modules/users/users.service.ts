import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Rol } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { BCRYPT_ROUNDS } from '../../common/crypto/bcrypt.constants';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.interface';
import { AuthService } from '../auth/services/auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async getMe(user: AuthUser) {
    const currentUser = await this.prisma.forUser(user).user.findUnique({
      where: { id: user.sub },
      select: {
        id: true,
        nombre: true,
        correo: true,
        telefono: true,
        direccion: true,
        rol: true,
        activo: true,
        emailVerifiedAt: true,
      },
    });

    if (!currentUser) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return { user: this.toSafeUser(currentUser) };
  }

  async updateMe(user: AuthUser, dto: UpdateProfileDto) {
    const db = this.prisma.forUser(user);
    const data: Prisma.UserUpdateInput = {};
    const passwordChanged = dto.password !== undefined;

    if (dto.nombre !== undefined) data.nombre = dto.nombre.trim();
    if (dto.correo !== undefined) data.correo = dto.correo.trim().toLowerCase();
    if (dto.telefono !== undefined) data.telefono = dto.telefono.trim() || null;
    if (dto.direccion !== undefined)
      data.direccion = dto.direccion.trim() || null;
    if (dto.password !== undefined)
      data.password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No hay campos para actualizar');
    }

    const updatedUser = await this.updateUserRecord(db, user.sub, data);

    if (passwordChanged) {
      await this.authService.revokeUserSessions(user.sub, {
        excludeSid: user.sid || undefined,
      });
    }

    return {
      message: 'Perfil actualizado correctamente',
      user: this.toSafeUser(updatedUser),
    };
  }

  async findAll(query?: { page?: number; pageSize?: number }) {
    const pageSize = Math.min(
      Number.isInteger(query?.pageSize) && query!.pageSize! > 0
        ? query!.pageSize!
        : 200,
      200,
    );
    const requestedPage =
      Number.isInteger(query?.page) && query!.page! > 0 ? query!.page! : 1;
    const total = await this.prisma.user.count();
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        nombre: true,
        correo: true,
        telefono: true,
        direccion: true,
        rol: true,
        activo: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });

    return {
      users,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasPrevious: page > 1,
        hasNext: page < totalPages,
      },
    };
  }

  async create(dto: CreateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { correo: dto.correo.trim().toLowerCase() },
    });

    if (existingUser) {
      throw new BadRequestException('El correo ya esta en uso');
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const now = new Date();
    const user = await this.prisma.user.create({
      data: {
        nombre: dto.nombre.trim(),
        correo: dto.correo.trim().toLowerCase(),
        password: hashedPassword,
        telefono: dto.telefono?.trim() || null,
        direccion: dto.direccion?.trim() || null,
        rol: dto.rol ?? Rol.CLIENT,
        activo: dto.activo ?? true,
        emailVerifiedAt: now,
      },
    });

    return {
      message: 'Usuario creado correctamente',
      user: this.toSafeUser(user),
    };
  }

  async update(currentUser: AuthUser, id: number, dto: UpdateUserDto) {
    const data: Prisma.UserUpdateInput = {};
    const passwordChanged = dto.password !== undefined;
    const roleChanged = dto.rol !== undefined;
    const activeChanged = dto.activo !== undefined;

    if (dto.nombre !== undefined) data.nombre = dto.nombre.trim();
    if (dto.correo !== undefined) data.correo = dto.correo.trim().toLowerCase();
    if (dto.telefono !== undefined) data.telefono = dto.telefono.trim() || null;
    if (dto.direccion !== undefined)
      data.direccion = dto.direccion.trim() || null;
    if (dto.rol !== undefined) data.rol = dto.rol;
    if (dto.password !== undefined)
      data.password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    if (dto.activo !== undefined) data.activo = dto.activo;

    if (currentUser.sub === id && dto.activo === false) {
      throw new BadRequestException(
        'No puedes dar de baja tu propio usuario mientras estas en sesion',
      );
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No hay campos para actualizar');
    }

    const updatedUser = await this.updateUserRecord(
      this.prisma.asAdmin(),
      id,
      data,
    );

    if (passwordChanged || roleChanged || activeChanged) {
      await this.authService.revokeUserSessions(id);
    }

    return {
      message: 'Usuario actualizado correctamente',
      user: this.toSafeUser(updatedUser),
    };
  }

  async remove(user: AuthUser, id: number) {
    if (user.sub === id) {
      throw new BadRequestException(
        'No puedes eliminar tu propio usuario mientras estas en sesion',
      );
    }

    try {
      await this.prisma.user.delete({ where: { id } });
      return { message: 'Usuario eliminado correctamente' };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Usuario no encontrado');
      }

      throw error;
    }
  }

  revokeAllSessionsAsAdmin(userId: number) {
    return this.authService.revokeAllUserSessionsAsAdmin(userId);
  }

  revokeSingleSessionAsAdmin(userId: number, sessionId: string) {
    return this.authService.revokeSingleUserSessionAsAdmin(userId, sessionId);
  }

  private async updateUserRecord(
    db: ReturnType<PrismaService['asAdmin']>,
    id: number,
    data: Prisma.UserUpdateInput,
  ) {
    try {
      return await db.user.update({
        where: { id },
        data,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('El correo ya esta en uso');
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Usuario no encontrado');
      }

      throw error;
    }
  }

  private toSafeUser(user: {
    id: number;
    nombre: string;
    correo: string;
    telefono: string | null;
    direccion: string | null;
    rol: Rol;
    activo: boolean;
    emailVerifiedAt?: Date | null;
  }) {
    return {
      id: user.id,
      nombre: user.nombre,
      correo: user.correo,
      telefono: user.telefono,
      direccion: user.direccion,
      rol: user.rol,
      activo: user.activo,
      emailVerified: Boolean(user.emailVerifiedAt),
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    };
  }
}
