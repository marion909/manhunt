import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeospatialService } from './geospatial.service';
import { GameBoundary } from '../games/entities/game-boundary.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([GameBoundary])],
  providers: [GeospatialService],
  exports: [GeospatialService],
})
export class GeospatialModule {}
