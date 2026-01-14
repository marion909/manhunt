import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateCapturesTable1737087729000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create captures table
    await queryRunner.createTable(
      new Table({
        name: 'captures',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'game_id',
            type: 'uuid',
          },
          {
            name: 'hunter_id',
            type: 'uuid',
          },
          {
            name: 'player_id',
            type: 'uuid',
          },
          {
            name: 'capture_location',
            type: 'geometry(Point,4326)',
          },
          {
            name: 'distance_meters',
            type: 'decimal',
            precision: 10,
            scale: 2,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED'],
            default: "'PENDING'",
          },
          {
            name: 'photo_url',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'initiated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'confirmed_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'confirmed_by',
            type: 'uuid',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Add foreign keys
    await queryRunner.createForeignKey(
      'captures',
      new TableForeignKey({
        columnNames: ['game_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'games',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'captures',
      new TableForeignKey({
        columnNames: ['hunter_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'captures',
      new TableForeignKey({
        columnNames: ['player_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    // Create indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_captures_game_id" ON "captures" ("game_id")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_captures_hunter_id" ON "captures" ("hunter_id")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_captures_player_id" ON "captures" ("player_id")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_captures_status" ON "captures" ("status")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_captures_initiated_at" ON "captures" ("initiated_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('captures');
  }
}
