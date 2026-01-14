import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddOverrideFieldsToPositions1737200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'positions',
      new TableColumn({
        name: 'is_override',
        type: 'boolean',
        default: false,
      }),
    );

    await queryRunner.addColumn(
      'positions',
      new TableColumn({
        name: 'overridden_by',
        type: 'uuid',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('positions', 'overridden_by');
    await queryRunner.dropColumn('positions', 'is_override');
  }
}
