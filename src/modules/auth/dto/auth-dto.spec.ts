import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RegisterDto } from './register.dto';
import { LoginDto } from './login.dto';

describe('Auth DTO Validation', () => {
  it('rejects RegisterDto with oversized nombre or correo', async () => {
    const dto = plainToInstance(RegisterDto, {
      nombre: 'a'.repeat(101),
      correo: 'valid@example.com',
      password: 'SecureP@ss1',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'nombre')).toBe(true);

    const dto2 = plainToInstance(RegisterDto, {
      nombre: 'Usuario Valido',
      correo: `${'a'.repeat(250)}@example.com`,
      password: 'SecureP@ss1',
    });

    const errors2 = await validate(dto2);
    expect(errors2.some((e) => e.property === 'correo')).toBe(true);
  });

  it('rejects LoginDto with oversized password or correo', async () => {
    const dto = plainToInstance(LoginDto, {
      correo: 'user@example.com',
      password: 'x'.repeat(73),
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'password')).toBe(true);

    const dto2 = plainToInstance(LoginDto, {
      correo: `${'b'.repeat(250)}@example.com`,
      password: 'ValidPassword123',
    });

    const errors2 = await validate(dto2);
    expect(errors2.some((e) => e.property === 'correo')).toBe(true);
  });

  it('accepts valid RegisterDto and LoginDto payloads', async () => {
    const regDto = plainToInstance(RegisterDto, {
      nombre: 'Juan Perez',
      correo: 'juan.perez@example.com',
      password: 'SecureP@ss1',
    });
    const regErrors = await validate(regDto);
    expect(regErrors.length).toBe(0);

    const loginDto = plainToInstance(LoginDto, {
      correo: 'juan.perez@example.com',
      password: 'SecureP@ss1',
    });
    const loginErrors = await validate(loginDto);
    expect(loginErrors.length).toBe(0);
  });
});
