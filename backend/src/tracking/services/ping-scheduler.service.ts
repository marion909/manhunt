import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GamesService } from '../../games/games.service';
import { GameStatus } from '../../common/enums/game-status.enum';

@Injectable()
export class PingSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(PingSchedulerService.name);
  private activeGameSchedules = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectQueue('ping-generation') private pingQueue: Queue,
    private readonly gamesService: GamesService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing ping scheduler for active games...');
    // Delay to allow TypeORM to fully initialize repositories
    setTimeout(() => this.syncActiveGames(), 1000);
  }

  /**
   * Schedule automatic ping generation for a game
   */
  async scheduleGamePings(gameId: string, intervalMinutes: number): Promise<void> {
    // Cancel existing schedule if any
    this.cancelGameSchedule(gameId);

    const intervalMs = intervalMinutes * 60 * 1000;
    this.logger.log(
      `Scheduling ping generation for game ${gameId} every ${intervalMinutes} minutes`,
    );

    // Add immediate first ping
    await this.pingQueue.add(
      'generate-ping',
      { gameId },
      {
        jobId: `ping-${gameId}-${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    // Schedule recurring pings
    const timer = setInterval(async () => {
      try {
        await this.pingQueue.add(
          'generate-ping',
          { gameId },
          {
            jobId: `ping-${gameId}-${Date.now()}`,
            removeOnComplete: true,
            removeOnFail: false,
          },
        );
      } catch (error) {
        this.logger.error(
          `Failed to add ping job for game ${gameId}: ${error.message}`,
          error.stack,
        );
      }
    }, intervalMs);

    this.activeGameSchedules.set(gameId, timer);
    this.logger.log(`Ping schedule created for game ${gameId}`);
  }

  /**
   * Cancel ping generation schedule for a game
   */
  cancelGameSchedule(gameId: string): void {
    const existingTimer = this.activeGameSchedules.get(gameId);
    if (existingTimer) {
      clearInterval(existingTimer);
      this.activeGameSchedules.delete(gameId);
      this.logger.log(`Cancelled ping schedule for game ${gameId}`);
    }
  }

  /**
   * Check and sync active games every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async syncActiveGames(): Promise<void> {
    try {
      const activeGames = await this.gamesService.findActiveGames();

      this.logger.debug(`Found ${activeGames.length} active games to sync`);

      // Cancel schedules for games that are no longer active
      for (const [gameId] of this.activeGameSchedules) {
        const gameStillActive = activeGames.some((g) => g.id === gameId);
        if (!gameStillActive) {
          this.cancelGameSchedule(gameId);
        }
      }

      // Ensure all active games have schedules
      for (const game of activeGames) {
        if (!this.activeGameSchedules.has(game.id)) {
          await this.scheduleGamePings(game.id, game.pingIntervalMinutes);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to sync active games: ${error.message}`, error.stack);
    }
  }

  /**
   * Get currently scheduled games
   */
  getScheduledGames(): string[] {
    return Array.from(this.activeGameSchedules.keys());
  }
}
