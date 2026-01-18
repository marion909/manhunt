import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPingSourceAndIsFake1737400000000 implements MigrationInterface {
  name = 'AddPingSourceAndIsFake1737400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for ping source
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE ping_source_enum AS ENUM ('PERIODIC', 'SPEEDHUNT', 'SILENTHUNT', 'FAKE_PING', 'MANUAL');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add source column with default PERIODIC
    await queryRunner.query(`
      ALTER TABLE "pings" 
      ADD COLUMN IF NOT EXISTS "source" ping_source_enum DEFAULT 'PERIODIC';
    `);

    // Add is_fake column with default false
    await queryRunner.query(`
      ALTER TABLE "pings" 
      ADD COLUMN IF NOT EXISTS "is_fake" boolean DEFAULT false;
    `);

    // Update existing fake pings (where metadata contains isFake: true)
    await queryRunner.query(`
      UPDATE "pings" 
      SET "source" = 'FAKE_PING', "is_fake" = true 
      WHERE metadata->>'isFake' = 'true';
    `);

    // Create index on source for filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pings_game_source" ON "pings" ("game_id", "source");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove index
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pings_game_source";`);

    // Remove columns
    await queryRunner.query(`ALTER TABLE "pings" DROP COLUMN IF EXISTS "is_fake";`);
    await queryRunner.query(`ALTER TABLE "pings" DROP COLUMN IF EXISTS "source";`);

    // Remove enum type
    await queryRunner.query(`DROP TYPE IF EXISTS ping_source_enum;`);
  }
}
