import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateGameRulesTable1737087728000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create game_rules table
    await queryRunner.createTable(
      new Table({
        name: 'game_rules',
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
            name: 'rule_type',
            type: 'enum',
            enum: [
              'BOUNDARY_VIOLATION',
              'SPEED_LIMIT',
              'NIGHT_MODE',
              'CAPTURE_RADIUS',
              'INACTIVITY',
            ],
          },
          {
            name: 'is_enabled',
            type: 'boolean',
            default: true,
          },
          {
            name: 'config',
            type: 'jsonb',
            default: "'{}'",
          },
          {
            name: 'action',
            type: 'enum',
            enum: ['LOG', 'WARN', 'DISQUALIFY'],
            default: "'LOG'",
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Add foreign key
    await queryRunner.createForeignKey(
      'game_rules',
      new TableForeignKey({
        columnNames: ['game_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'games',
        onDelete: 'CASCADE',
      }),
    );

    // Create index for game_id
    await queryRunner.query(
      `CREATE INDEX "IDX_game_rules_game_id" ON "game_rules" ("game_id")`,
    );

    // Create index for rule_type
    await queryRunner.query(
      `CREATE INDEX "IDX_game_rules_rule_type" ON "game_rules" ("rule_type")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('game_rules');
  }
}
