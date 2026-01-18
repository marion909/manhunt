import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGameMechanicRules1737300000000 implements MigrationInterface {
  name = 'CreateGameMechanicRules1737300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new rule types to the enum
    await queryRunner.query(`
      ALTER TYPE "game_rules_rule_type_enum" ADD VALUE IF NOT EXISTS 'SILENTHUNT';
      ALTER TYPE "game_rules_rule_type_enum" ADD VALUE IF NOT EXISTS 'SPEEDHUNT';
      ALTER TYPE "game_rules_rule_type_enum" ADD VALUE IF NOT EXISTS 'REGENERATION';
      ALTER TYPE "game_rules_rule_type_enum" ADD VALUE IF NOT EXISTS 'HUNTER_ANFRAGEN';
    `);

    // Create enum for speedhunt status
    await queryRunner.query(`
      CREATE TYPE "speedhunt_sessions_status_enum" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED')
    `);

    // Create participant_rule_states table
    await queryRunner.query(`
      CREATE TABLE "participant_rule_states" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "participant_id" uuid NOT NULL,
        "rule_type" "game_rules_rule_type_enum" NOT NULL,
        "is_assigned" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT false,
        "activated_at" TIMESTAMP,
        "expires_at" TIMESTAMP,
        "usage_count" integer NOT NULL DEFAULT 0,
        "last_reset_at" TIMESTAMP,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_participant_rule_states" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_participant_rule_type" UNIQUE ("participant_id", "rule_type")
      )
    `);

    // Create index on participant_rule_states
    await queryRunner.query(`
      CREATE INDEX "IDX_participant_rule_states_participant_rule" 
      ON "participant_rule_states" ("participant_id", "rule_type")
    `);

    // Add foreign key for participant
    await queryRunner.query(`
      ALTER TABLE "participant_rule_states" 
      ADD CONSTRAINT "FK_participant_rule_states_participant" 
      FOREIGN KEY ("participant_id") REFERENCES "game_participants"("id") ON DELETE CASCADE
    `);

    // Create speedhunt_sessions table
    await queryRunner.query(`
      CREATE TABLE "speedhunt_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "game_id" uuid NOT NULL,
        "hunter_participant_id" uuid NOT NULL,
        "target_participant_id" uuid NOT NULL,
        "total_pings" integer NOT NULL,
        "used_pings" integer NOT NULL DEFAULT 0,
        "status" "speedhunt_sessions_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "started_at" TIMESTAMP NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMP,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_speedhunt_sessions" PRIMARY KEY ("id")
      )
    `);

    // Create indexes on speedhunt_sessions
    await queryRunner.query(`
      CREATE INDEX "IDX_speedhunt_sessions_game_status" 
      ON "speedhunt_sessions" ("game_id", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_speedhunt_sessions_target_status" 
      ON "speedhunt_sessions" ("target_participant_id", "status")
    `);

    // Add foreign keys for speedhunt_sessions
    await queryRunner.query(`
      ALTER TABLE "speedhunt_sessions" 
      ADD CONSTRAINT "FK_speedhunt_sessions_game" 
      FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "speedhunt_sessions" 
      ADD CONSTRAINT "FK_speedhunt_sessions_hunter" 
      FOREIGN KEY ("hunter_participant_id") REFERENCES "game_participants"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "speedhunt_sessions" 
      ADD CONSTRAINT "FK_speedhunt_sessions_target" 
      FOREIGN KEY ("target_participant_id") REFERENCES "game_participants"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop speedhunt_sessions table and constraints
    await queryRunner.query(`DROP TABLE IF EXISTS "speedhunt_sessions"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "speedhunt_sessions_status_enum"`);

    // Drop participant_rule_states table and constraints
    await queryRunner.query(`DROP TABLE IF EXISTS "participant_rule_states"`);

    // Note: Cannot easily remove enum values in PostgreSQL
    // The new enum values will remain but be unused
  }
}
