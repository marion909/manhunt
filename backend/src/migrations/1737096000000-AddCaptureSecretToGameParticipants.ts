import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCaptureSecretToGameParticipants1737096000000 implements MigrationInterface {
  name = 'AddCaptureSecretToGameParticipants1737096000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "game_participants" 
      ADD COLUMN "capture_secret" character varying
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "game_participants"."capture_secret" 
      IS 'TOTP secret for generating time-based capture codes'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "game_participants" 
      DROP COLUMN "capture_secret"
    `);
  }
}
