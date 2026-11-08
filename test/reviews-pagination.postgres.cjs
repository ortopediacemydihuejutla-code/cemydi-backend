require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient, Prisma } = require('@prisma/client');
const { ReviewsService } = require('../dist/modules/reviews/reviews.service');

async function main() {
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(
      new URL(process.env.DATABASE_URL).hostname,
    )
  )
    throw new Error('This check only supports local PostgreSQL.');
  const db = new PrismaClient();
  const rollback = new Error('Expected fixture rollback');
  try {
    await db.$transaction(
      async (tx) => {
        const tag = randomUUID();
        const product = await tx.product.create({
          data: {
            nombre: 'QA reviews',
            slug: `qa-reviews-${tag}`,
            marca: 'QA',
            modelo: 'QA',
            descripcion: 'Temporary pagination test',
            precio: 1,
            clasificacion: 'QA',
            stock: 1,
            proveedor: 'QA',
            tipoAdquisicion: 'VENTA',
          },
        });
        const users = [];
        for (let index = 0; index < 27; index += 1) {
          const user = await tx.user.create({
            data: {
              nombre: 'QA',
              correo: `qa-${tag}-${index}@example.invalid`,
              password: 'not-a-login-password',
            },
          });
          users.push(user);
        }
        const date = new Date('2026-01-01T00:00:00Z');
        await tx.review.createMany({
          data: users.map((user, index) => ({
            productId: product.id,
            userId: user.id,
            rating: index < 25 ? 4 : 1,
            comment: 'Temporary review',
            status: index < 25 ? 'APPROVED' : 'PENDING',
            createdAt: date,
          })),
        });
        const service = new ReviewsService({
          asReader: () => ({
            review: tx.review,
            $transaction: (callback) => callback(tx),
          }),
        });
        const legacy = await service.listApprovedByProduct(product.id);
        assert.equal(legacy.reviews.length, 25);
        assert.equal(legacy.pagination, undefined);
        const ids = [];
        for (let page = 1; page <= 3; page += 1) {
          const response = await service.listApprovedByProduct(product.id, {
            page,
            pageSize: 10,
          });
          assert.equal(response.reviews.length, page === 3 ? 5 : 10);
          assert.deepEqual(response.summary, { count: 25, averageRating: 4 });
          assert.equal(response.pagination.hasNextPage, page < 3);
          ids.push(...response.reviews.map((review) => review.id));
          assert.ok(
            response.reviews.every(
              (review) =>
                Object.keys(review).sort().join(',') ===
                'comment,createdAt,id,rating,user',
            ),
          );
        }
        assert.equal(new Set(ids).size, 25);
        assert.deepEqual(
          ids,
          [...ids].sort((a, b) => b - a),
        );
        const empty = await service.listApprovedByProduct(product.id, {
          page: 4,
          pageSize: 10,
        });
        assert.equal(empty.reviews.length, 0);
        assert.equal(empty.summary.count, 25);
        throw rollback;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 30000,
      },
    );
    throw new Error('Fixture transaction should have rolled back.');
  } catch (error) {
    if (error !== rollback) throw error;
    console.log(
      'PASS PostgreSQL: legacy response, page bounds, global approved-only summary, stable order and no duplicate rows. Fixtures rolled back.',
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
