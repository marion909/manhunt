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

  /**
   * Check if point is within inner zone of a game
   */
  async isPointInInnerZone(point: Point, gameId: string): Promise<boolean> {
    const result = await this.boundariesRepository
      .createQueryBuilder('boundary')
      .where('boundary.gameId = :gameId', { gameId })
      .andWhere('boundary.type = :type', { type: BoundaryType.INNER_ZONE })
      .andWhere('boundary.active = true')
      .andWhere('ST_Contains(boundary.geometry, ST_SetSRID(ST_GeomFromGeoJSON(:point), 4326))', {
        point: JSON.stringify(point),
      })
      .getCount();

    return result > 0;
  }

  /**
   * Check if point is in outer zone (in game area but NOT in inner zone)
   * Returns true if in outer_zone boundary OR (in game_area but not in inner_zone)
   */
  async isPointInOuterZone(point: Point, gameId: string): Promise<boolean> {
    // First check if explicitly in an outer_zone boundary
    const inExplicitOuter = await this.boundariesRepository
      .createQueryBuilder('boundary')
      .where('boundary.gameId = :gameId', { gameId })
      .andWhere('boundary.type = :type', { type: BoundaryType.OUTER_ZONE })
      .andWhere('boundary.active = true')
      .andWhere('ST_Contains(boundary.geometry, ST_SetSRID(ST_GeomFromGeoJSON(:point), 4326))', {
        point: JSON.stringify(point),
      })
      .getCount();

    if (inExplicitOuter > 0) return true;

    // If no explicit outer zone, check if in game area but NOT in inner zone
    const inGameArea = await this.isPointInGameArea(point, gameId);
    if (!inGameArea) return false;

    const inInnerZone = await this.isPointInInnerZone(point, gameId);
    return !inInnerZone;
  }

  /**
   * Get the zone type a point is in (INNER_ZONE, OUTER_ZONE, or null if outside game area)
   */
  async getPointZone(point: Point, gameId: string): Promise<BoundaryType | null> {
    // Check inner zone first (more restrictive)
    const inInnerZone = await this.isPointInInnerZone(point, gameId);
    if (inInnerZone) return BoundaryType.INNER_ZONE;

    // Check outer zone (fallback if game_area doesn't exist)
    const inOuterZone = await this.isPointInBoundary(point, gameId, BoundaryType.OUTER_ZONE);
    if (inOuterZone) return BoundaryType.OUTER_ZONE;

    // Finally check game area if it exists
    const inGameArea = await this.isPointInGameArea(point, gameId);
    if (inGameArea) return BoundaryType.OUTER_ZONE; // Treat game_area as outer zone

    return null;
  }
}
