// src/store/adminStore.js
import { create } from "zustand";
import {
  subscribeToUsers,
  subscribeToBookings,
  subscribeToSOSEvents,
  subscribeToWeatherData,
} from "../services/firebase";

export const useAdminStore = create((set) => ({
  // Auth
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  logout: () => set({ user: null, isAuthenticated: false }),

  // Data
  users: [],
  bookings: [],
  sosEvents: [],
  weatherData: [],

  setUsers: (users) => set({ users }),
  setBookings: (bookings) => set({ bookings }),
  setSOSEvents: (sosEvents) => set({ sosEvents }),
  setWeatherData: (weatherData) => set({ weatherData }),

  // Stats
  getStats: (state) => ({
    totalUsers: state.users.length,
    totalBookings: state.bookings.length,
    pendingBookings: state.bookings.filter((b) => b.status === "pending")
      .length,
    activeSOSEvents: state.sosEvents.filter((e) => e.status === "active")
      .length,
  }),

  // Subscribe to real-time updates
  subscribe: () => {
    const unsubUsers = subscribeToUsers((users) =>
      set({ users })
    );
    const unsubBookings = subscribeToBookings((bookings) =>
      set({ bookings })
    );
    const unsubSOS = subscribeToSOSEvents((sosEvents) =>
      set({ sosEvents })
    );
    const unsubWeather = subscribeToWeatherData((weatherData) =>
      set({ weatherData })
    );

    return () => {
      unsubUsers();
      unsubBookings();
      unsubSOS();
      unsubWeather();
    };
  },
}));