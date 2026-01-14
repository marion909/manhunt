import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakePositionUserIdNullable1705243000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "positions" 
      DROP CONSTRAINT "FK_4960bf74ea7fea6db05e53989da"
    `);

    // Make user_id nullable
    await queryRunner.query(`
      ALTER TABLE "positions" 
      ALTER COLUMN "user_id" DROP NOT NULL
    `);

    // Re-add the foreign key constraint (now with nullable)
    await queryRunner.query(`
      ALTER TABLE "positions" 
      ADD CONSTRAINT "FK_4960bf74ea7fea6db05e53989da" 
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "positions" 
      DROP CONSTRAINT "FK_4960bf74ea7fea6db05e53989da"
    `);

    // Make user_id NOT NULL again (this might fail if there are NULL values)
    await queryRunner.query(`
      ALTER TABLE "positions" 
      ALTER COLUMN "user_id" SET NOT NULL
    `);

    // Re-add the foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "positions" 
      ADD CONSTRAINT "FK_4960bf74ea7fea6db05e53989da" 
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }
}
