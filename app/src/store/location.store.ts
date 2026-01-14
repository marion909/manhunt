import { create } from 'zustand';
import { LocationData } from '../types';

interface LocationStore {
  currentPosition: LocationData | null;
  isTracking: boolean;
  lastUpdate: Date | null;
  updatePosition: (position: LocationData) => void;
  setTracking: (isTracking: boolean) => void;
}

export const useLocationStore = create<LocationStore>((set) => ({
  currentPosition: null,
  isTracking: false,
  lastUpdate: null,

  updatePosition: (position) => {
    set({
      currentPosition: position,
      lastUpdate: new Date(),
    });
  },

  setTracking: (isTracking) => {
    set({ isTracking });
  },
}));
