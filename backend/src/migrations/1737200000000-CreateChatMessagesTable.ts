import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChatMessagesTable1737200000000 implements MigrationInterface {
  name = 'CreateChatMessagesTable1737200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create chat_messages table
    await queryRunner.query(`
      CREATE TYPE "chat_channel_enum" AS ENUM('GLOBAL', 'HUNTERS', 'PLAYERS', 'ORGA', 'DIRECT');
    `);

    await queryRunner.query(`
      CREATE TYPE "message_type_enum" AS ENUM('TEXT', 'SYSTEM', 'VOICE_STARTED', 'VOICE_ENDED');
    `);

    await queryRunner.query(`
      CREATE TABLE "chat_messages" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "game_id" uuid NOT NULL,
        "sender_id" uuid,
        "channel" "chat_channel_enum" NOT NULL,
        "message_type" "message_type_enum" NOT NULL DEFAULT 'TEXT',
        "content" text NOT NULL,
        "recipient_id" uuid,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "fk_chat_messages_game" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_chat_messages_sender" FOREIGN KEY ("sender_id") REFERENCES "game_participants"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_chat_messages_recipient" FOREIGN KEY ("recipient_id") REFERENCES "game_participants"("id") ON DELETE SET NULL
      );
    `);

    // Create indexes for efficient querying
    await queryRunner.query(`
      CREATE INDEX "idx_chat_messages_game_created" ON "chat_messages" ("game_id", "created_at" DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_chat_messages_game_channel" ON "chat_messages" ("game_id", "channel");
    `);

    // Add new rule types to game_rules enum
    await queryRunner.query(`
      ALTER TYPE "game_rules_rule_type_enum" ADD VALUE IF NOT EXISTS 'PLAYER_TEXT_CHAT';
    `);

    await queryRunner.query(`
      ALTER TYPE "game_rules_rule_type_enum" ADD VALUE IF NOT EXISTS 'PLAYER_VOICE_CHAT';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chat_messages_game_channel";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chat_messages_game_created";`);

    // Drop table
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_messages";`);

    // Drop enums
    await queryRunner.query(`DROP TYPE IF EXISTS "message_type_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "chat_channel_enum";`);

    // Note: Cannot remove values from enum in PostgreSQL, would need to recreate
  }
}
