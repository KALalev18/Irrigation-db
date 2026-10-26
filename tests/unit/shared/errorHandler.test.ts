import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { globalErrorHandler } from '../../../src/shared/middleware/errorHandler';
import { AppError, ErrorCode } from '../../../src/shared/errors/AppError';

function mockResponse() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

function handle(err: unknown) {
  const res = mockResponse();
  globalErrorHandler(err, {} as Request, res as unknown as Response, jest.fn());
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
}

describe('globalErrorHandler', () => {
  it('passes AppError status and code through', () => {
    const { status, body } = handle(AppError.notFound('Sensor', 'abc', ErrorCode.SENSOR_NOT_FOUND));

    expect(status).toBe(404);
    expect(body.error.code).toBe('SENSOR_NOT_FOUND');
  });

  it('maps a Postgres CHECK violation to 422 with the constraint name', () => {
    // Message shape copied from a real Prisma 6 error for this constraint
    const err = new Prisma.PrismaClientUnknownRequestError(
      'Error occurred during query execution:\nConnectorError(ConnectorError { kind: QueryError(PostgresError { ' +
        'code: "23514", message: "new row for relation \\"zones\\" violates check constraint \\"zones_area_positive\\"" }) })',
      { clientVersion: '6.19.3' },
    );

    const { status, body } = handle(err);

    expect(status).toBe(422);
    expect(body.error).toEqual({
      code: 'CHECK_VIOLATION',
      message: 'Value rejected by a database constraint',
      meta: { constraint: 'zones_area_positive' },
    });
  });

  it('maps a serialization failure (P2034) to 503 so the client can retry', () => {
    const err = new Prisma.PrismaClientKnownRequestError('write conflict', {
      code: 'P2034',
      clientVersion: '6.19.3',
    });

    const { status, body } = handle(err);

    expect(status).toBe(503);
    expect(body.error.code).toBe('TRANSACTION_DEADLOCK');
  });

  it('hides details of unexpected errors', () => {
    const { status, body } = handle(new Error('secret connection string'));

    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});
