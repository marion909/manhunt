import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as turf from '@turf/turf';
import { GameBoundary } from '../games/entities/game-boundary.entity';
import { Point, Polygon } from 'geojson';
import { BoundaryType } from '../common/enums';

@Injectable()
export class GeospatialService {
  constructor(
    @InjectRepository(GameBoundary)
    private boundariesRepository: Repository<GameBoundary>,
  ) {}

  /**
   * Check if a point is inside a polygon using PostGIS
   */
  async isPointInBoundary(point: Point, boundaryId: string): Promise<boolean> {
    const result = await this.boundariesRepository
      .createQueryBuilder('boundary')
      .where('boundary.id = :boundaryId', { boundaryId })
      .andWhere('ST_Contains(boundary.geometry, ST_SetSRID(ST_GeomFromGeoJSON(:point), 4326))', {
        point: JSON.stringify(point),
      })
      .getCount();

    return result > 0;
  }

  /**
   * Check if point is within game area (any game_area boundary)
   */
  async isPointInGameArea(point: Point, gameId: string): Promise<boolean> {
    const result = await this.boundariesRepository
      .createQueryBuilder('boundary')
      .where('boundary.gameId = :gameId', { gameId })
      .andWhere('boundary.type = :type', { type: BoundaryType.GAME_AREA })
      .andWhere('boundary.active = true')
      .andWhere('ST_Contains(boundary.geometry, ST_SetSRID(ST_GeomFromGeoJSON(:point), 4326))', {
        point: JSON.stringify(point),
      })
      .getCount();

    return result > 0;
  }

  /**
   * Calculate distance between two points in meters using PostGIS
   */
  async getDistance(point1: Point, point2: Point): Promise<number> {
    const result = await this.boundariesRepository.query(
      `SELECT ST_Distance(
        ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography,
        ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)::geography
      ) as distance`,
      [JSON.stringify(point1), JSON.stringify(point2)],
    );

    return parseFloat(result[0]?.distance || 0);
  }

  /**
   * Calculate distance using Turf.js (client-side alternative)
   */
  calculateDistanceTurf(point1: Point, point2: Point): number {
    const from = turf.point(point1.coordinates);
    const to = turf.point(point2.coordinates);
    return turf.distance(from, to, { units: 'meters' });
  }

  /**
   * Check if point is within radius of another point
   */
  isWithinRadius(point1: Point, point2: Point, radiusMeters: number): boolean {
    const distance = this.calculateDistanceTurf(point1, point2);
    return distance <= radiusMeters;
  }

  /**
   * Generate random point within radius (for fake ping offsets)
   */
  generateRandomPointInRadius(center: Point, radiusMeters: number): Point {
    const centerPoint = turf.point(center.coordinates);
    const bearing = Math.random() * 360;
    const distance = Math.random() * radiusMeters;
    const newPoint = turf.destination(centerPoint, distance, bearing, { units: 'meters' });
    
    return {
      type: 'Point',
      coordinates: newPoint.geometry.coordinates,
    };
  }

  /**
   * Validate polygon geometry
   */
  validatePolygon(polygon: Polygon): boolean {
    try {
      const turfPolygon = turf.polygon(polygon.coordinates);
      // Simple validation: check if coordinates exist and are valid
      return polygon.coordinates && polygon.coordinates.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Calculate polygon area in square meters
   */
  calculateArea(polygon: Polygon): number {
    const turfPolygon = turf.polygon(polygon.coordinates);
    return turf.area(turfPolygon);
  }

  /**
   * Get center point of polygon
   */
  getPolygonCenter(polygon: Polygon): Point {
    const turfPolygon = turf.polygon(polygon.coordinates);
    const center = turf.centroid(turfPolygon);
    return center.geometry;
  }

  /**
   * Check speed for anti-cheat (detect teleportation)
   */
  calculateSpeed(
    point1: Point,
    timestamp1: Date,
    point2: Point,
    timestamp2: Date,
  ): number {
    const distance = this.calculateDistanceTurf(point1, point2);
    const timeDiffSeconds = Math.abs(timestamp2.getTime() - timestamp1.getTime()) / 1000;
    
    if (timeDiffSeconds === 0) return 0;
    
    // Return speed in km/h
    const speedMps = distance / timeDiffSeconds;
    return (speedMps * 3600) / 1000;
  }

  /**
   * Detect suspicious movement (>50 km/h)
   */
  isSuspiciousMovement(
    point1: Point,
    timestamp1: Date,
    point2: Point,
    timestamp2: Date,
  ): boolean {
    const speed = this.calculateSpeed(point1, timestamp1, point2, timestamp2);
    return speed > 50; // Flag if faster than 50 km/h
  }
}
