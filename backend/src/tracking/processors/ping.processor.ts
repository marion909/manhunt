import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { TrackingService } from '../tracking.service';
import { GamesService } from '../../games/games.service';
import { GameStatus } from '../../common/enums/game-status.enum';
import { Role } from '../../common/enums/role.enum';
import { ParticipantStatus } from '../../common/enums/participant-status.enum';

@Processor('ping-generation', { concurrency: 5 })
export class PingProcessor extends WorkerHost {
  private readonly logger = new Logger(PingProcessor.name);

  constructor(
    private readonly trackingService: TrackingService,
    private readonly gamesService: GamesService,
  ) {
    super();
  }

  async process(job: Job<{ gameId: string }>): Promise<void> {
    const { gameId } = job.data;
    this.logger.debug(`Processing ping generation for game ${gameId}`);

    try {
      const game = await this.gamesService.findOne(gameId, null);

      if (!game || game.status !== GameStatus.ACTIVE) {
        this.logger.warn(`Game ${gameId} is not active, skipping ping generation`);
        return;
      }

      // Get all players (non-hunters) in the game
      const players = game.participants.filter(
        (p) => p.role !== Role.HUNTER && p.status === ParticipantStatus.ACTIVE,
      );

      this.logger.log(`Generating pings for ${players.length} players in game ${gameId}`);

      // Generate ping for each player
      for (const player of players) {
        try {
          await this.trackingService.generatePing(gameId, player.userId);
        } catch (error) {
          this.logger.error(
            `Failed to generate ping for user ${player.userId}: ${error.message}`,
            error.stack,
          );
        }
      }

      this.logger.log(`Successfully generated pings for game ${gameId}`);
    } catch (error) {
      this.logger.error(
        `Failed to process ping generation for game ${gameId}: ${error.message}`,
        error.stack,
      );
      throw error; // Re-throw to let Bull handle retry logic
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Job ${job.id} completed for game ${job.data.gameId}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `Job ${job.id} failed for game ${job.data.gameId}: ${error.message}`,
      error.stack,
    );
  }
}
