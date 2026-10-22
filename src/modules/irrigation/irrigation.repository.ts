// All SQL for the IrrigationEvent model.
// `complete` uses a SERIALIZABLE transaction to prevent a race where two concurrent
// requests both read status=ACTIVE and both write status=COMPLETED. Under READ COMMITTED
// both writes would succeed; SERIALIZABLE makes Postgres reject one with P2034.
import { PrismaClient, Prisma } from '@prisma/client';
import { StartIrrigationDto, UpdateIrrigationEventDto } from './irrigation.validation';
import { AppError, ErrorCode } from '../../shared/errors/AppError';

// Use the generated Prisma type directly to avoid maintaining a separate interface.
type IrrigationEvent = Prisma.IrrigationEventGetPayload<Record<string, never>>;

export class IrrigationRepository {
  constructor(private readonly db: PrismaClient) {}

  async findById(id: string): Promise<IrrigationEvent | null> {
    return this.db.irrigationEvent.findUnique({ where: { id } });
  }

  async findByZone(
    zoneId: string,
    params: { limit: number; offset: number },
  ): Promise<IrrigationEvent[]> {
    return this.db.irrigationEvent.findMany({
      where: { zoneId },
      orderBy: { startedAt: 'desc' },
      take: params.limit,
      skip: params.offset,
    });
  }

  async create(dto: StartIrrigationDto): Promise<IrrigationEvent> {
    return this.db.irrigationEvent.create({
      data: {
        zoneId: dto.zoneId,
        trigger: dto.trigger,
        durationSec: dto.durationSec,
        notes: dto.notes,
        startedAt: new Date(),
        status: 'ACTIVE',
      },
    });
  }

  async complete(
    id: string,
    update: UpdateIrrigationEventDto,
  ): Promise<IrrigationEvent> {
    return this.db.$transaction(
      async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
        // Read before write — establishes the serialization dependency that lets Postgres detect the race.
        const event = await tx.irrigationEvent.findUnique({
          where: { id },
          select: { status: true },
        });
        if (!event) {
          throw AppError.notFound('IrrigationEvent', id, ErrorCode.IRRIGATION_EVENT_NOT_FOUND);
        }
        if (event.status === 'COMPLETED') {
          throw new AppError(`Irrigation event "${id}" is already completed`, ErrorCode.EVENT_ALREADY_COMPLETED, 409);
        }
        return tx.irrigationEvent.update({
          where: { id },
          data: {
            status: update.status,
            volumeLiters: update.volumeLiters,
            notes: update.notes,
            endedAt: new Date(),
          },
        });
      },
      // SERIALIZABLE is the only isolation level that prevents the read-modify-write
      // race described in the module header. Prisma accepts string literals here.
      { isolationLevel: 'Serializable' },
    );
  }
}
