import * as Location from 'expo-location';
import { LocationData } from '../types';
import { useLocationStore } from '../store/location.store';

class LocationService {
  private watchId: Location.LocationSubscription | null = null;
  private currentPosition: LocationData | null = null;

  async initialize(): Promise<boolean> {
    try {
      // Request foreground permission
      const { status: foregroundStatus } =
        await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        console.error('Foreground location permission denied');
        return false;
      }

      // Request background permission
      const { status: backgroundStatus } =
        await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus !== 'granted') {
        console.error('Background location permission denied');
        return false;
      }

      // Start watching position
      await this.startWatching();
      return true;
    } catch (error) {
      console.error('Failed to initialize location service:', error);
      return false;
    }
  }

  async startWatching(): Promise<void> {
    if (this.watchId) {
      console.log('Already watching position');
      return;
    }

    try {
      this.watchId = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation, // Highest accuracy
          distanceInterval: 0, // Update on any movement
          timeInterval: 1000, // Update every second
        },
        (position) => {
          const locationData: LocationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy || 0,
            altitude: position.coords.altitude || undefined,
            speed: position.coords.speed || undefined,
            heading: position.coords.heading || undefined,
          };

          this.currentPosition = locationData;
          useLocationStore.getState().updatePosition(locationData);
        }
      );

      useLocationStore.getState().setTracking(true);
      console.log('Started watching position');
    } catch (error) {
      console.error('Failed to start watching position:', error);
      throw error;
    }
  }

  async stopWatching(): Promise<void> {
    if (this.watchId) {
      this.watchId.remove();
      this.watchId = null;
      useLocationStore.getState().setTracking(false);
      console.log('Stopped watching position');
    }
  }

  getCurrentPosition(): LocationData | null {
    return this.currentPosition;
  }

  async getPositionOnce(): Promise<LocationData> {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy || 0,
      altitude: position.coords.altitude || undefined,
      speed: position.coords.speed || undefined,
      heading: position.coords.heading || undefined,
    };
  }
}

export const locationService = new LocationService();
