import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangePositionToParticipantId1705244000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the old foreign key constraint on user_id
    await queryRunner.query(`
      ALTER TABLE "positions" 
      DROP CONSTRAINT IF EXISTS "FK_4960bf74ea7fea6db05e53989da"
    `);

    // Drop the old index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_6ec48ad45b08731159500a6777"
    `);

    // Rename column from user_id to participant_id
    await queryRunner.query(`
      ALTER TABLE "positions" 
      RENAME COLUMN "user_id" TO "participant_id"
    `);

    // Make participant_id NOT NULL (it should always reference a participant)
    await queryRunner.query(`
      ALTER TABLE "positions" 
      ALTER COLUMN "participant_id" SET NOT NULL
    `);

    // Add new foreign key constraint to game_participants
    await queryRunner.query(`
      ALTER TABLE "positions" 
      ADD CONSTRAINT "FK_positions_participant" 
      FOREIGN KEY ("participant_id") REFERENCES "game_participants"("id") ON DELETE CASCADE
    `);

    // Create new index
    await queryRunner.query(`
      CREATE INDEX "IDX_positions_game_participant_timestamp" 
      ON "positions" ("game_id", "participant_id", "timestamp")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the new foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "positions" 
      DROP CONSTRAINT IF EXISTS "FK_positions_participant"
    `);

    // Drop the new index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_positions_game_participant_timestamp"
    `);

    // Rename column back
    await queryRunner.query(`
      ALTER TABLE "positions" 
      RENAME COLUMN "participant_id" TO "user_id"
    `);

    // Make nullable again
    await queryRunner.query(`
      ALTER TABLE "positions" 
      ALTER COLUMN "user_id" DROP NOT NULL
    `);

    // Re-add old foreign key
    await queryRunner.query(`
      ALTER TABLE "positions" 
      ADD CONSTRAINT "FK_4960bf74ea7fea6db05e53989da" 
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    // Re-create old index
    await queryRunner.query(`
      CREATE INDEX "IDX_6ec48ad45b08731159500a6777" 
      ON "positions" ("game_id", "user_id", "timestamp")
    `);
  }
}
