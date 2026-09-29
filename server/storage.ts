import { type Profile, type InsertProfile, type UpdateProfile } from "@shared/schema";
import { randomUUID } from "crypto";

// modify the interface with any CRUD methods
// you might need
//
// NOTE: this is an in-memory stub kept for local development. It is replaced by
// the Drizzle client in server/db.ts once the profiles API is wired up.

export interface IStorage {
  getProfile(id: string): Promise<Profile | undefined>;
  getProfileByDisplayName(displayName: string): Promise<Profile | undefined>;
  createProfile(profile: InsertProfile): Promise<Profile>;
  updateProfile(id: string, updates: UpdateProfile): Promise<Profile | undefined>;
}

export class MemStorage implements IStorage {
  private profiles: Map<string, Profile>;

  constructor() {
    this.profiles = new Map();
  }

  async getProfile(id: string): Promise<Profile | undefined> {
    return this.profiles.get(id);
  }

  async getProfileByDisplayName(displayName: string): Promise<Profile | undefined> {
    return Array.from(this.profiles.values()).find(
      (profile) => profile.displayName === displayName,
    );
  }

  async createProfile(insertProfile: InsertProfile): Promise<Profile> {
    const id = randomUUID();
    const profile: Profile = {
      ...insertProfile,
      id,
      role: insertProfile.role ?? "student",
      displayName: insertProfile.displayName ?? null,
      homeLat: insertProfile.homeLat ?? null,
      homeLng: insertProfile.homeLng ?? null,
      prefStepFree: insertProfile.prefStepFree ?? false,
      createdAt: new Date(),
    };
    this.profiles.set(id, profile);
    return profile;
  }

  async updateProfile(id: string, updates: UpdateProfile): Promise<Profile | undefined> {
    const existing = this.profiles.get(id);
    if (!existing) return undefined;
    const updated: Profile = { ...existing, ...updates, id };
    this.profiles.set(id, updated);
    return updated;
  }
}

export const storage = new MemStorage();
