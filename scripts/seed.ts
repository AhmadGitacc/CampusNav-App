/**
 * Seeds Postgres with the campus dataset.
 *
 *   npm run db:seed
 *
 * Requires DIRECT_URL or DATABASE_URL (see .env.example). Idempotent: campuses
 * upsert by slug, buildings by (campus, name), entrances by (building, name),
 * path nodes by (campus, lat, lng) and path edges by (from, to) — re-running
 * updates in place.
 */
import "./load-env";
import { eq } from "drizzle-orm";
import { assertDatabaseConfigured, db, pool } from "../server/db";
import { buildings, campuses, entrances, pathEdges, pathNodes } from "@shared/schema";
import { SEED_BUILDINGS, SEED_CAMPUSES } from "../lib/data/campus-fallback";
import {
  SEED_ENTRANCES,
  SEED_PATH_EDGES,
  SEED_PATH_NODES,
} from "../lib/data/path-graph-fallback";

/** Path node rows key on the unique (campus, lat, lng); this maps slugs to uuids. */
function nodeCoordKey(lat: number, lng: number): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

async function seedPathGraph(campusId: string, campusSlug: string) {
  const seedNodes = SEED_PATH_NODES;
  const seedEdges = SEED_PATH_EDGES;
  const seedEntrances = SEED_ENTRANCES;

  console.log(
    `  → ${campusSlug} path graph: ${seedNodes.length} nodes, ${seedEdges.length} edges, ${seedEntrances.length} entrances`
  );

  // Buildings are keyed by slug here but by uuid in the database, so resolve
  // them before the entrances that reference them.
  const buildingRows = await db
    .select({ id: buildings.id, name: buildings.name })
    .from(buildings)
    .where(eq(buildings.campusId, campusId));
  const buildingIdByName = new Map(buildingRows.map((row) => [row.name, row.id]));

  for (const entrance of seedEntrances) {
    const building = (SEED_BUILDINGS[campusSlug] ?? []).find(
      (candidate) => candidate.id === entrance.buildingId
    );
    const buildingId = building ? buildingIdByName.get(building.name) : undefined;
    if (!buildingId) {
      console.error(`  ! no building for entrance ${entrance.name} — skipped`);
      continue;
    }

    const values = {
      buildingId,
      name: entrance.name,
      lat: entrance.lat,
      lng: entrance.lng,
      hasRamp: entrance.hasRamp ?? false,
      hasSteps: entrance.hasSteps ?? false,
      stepFree: entrance.stepFree ?? true,
      gated: entrance.gated ?? false,
      gateClosesAt: entrance.gateClosesAt ?? null,
    };

    await db
      .insert(entrances)
      .values(values)
      .onConflictDoUpdate({
        target: [entrances.buildingId, entrances.name],
        set: values,
      });
  }

  // Nodes are inserted do-nothing on the (campus, lat, lng) unique so a
  // re-run never duplicates a junction; the map is read back afterwards
  // because the graph rows reference uuids, not slugs.
  await db
    .insert(pathNodes)
    .values(
      seedNodes.map((node) => ({
        campusId,
        lat: node.lat,
        lng: node.lng,
      }))
    )
    .onConflictDoNothing();

  const nodeRows = await db
    .select({ id: pathNodes.id, lat: pathNodes.lat, lng: pathNodes.lng })
    .from(pathNodes)
    .where(eq(pathNodes.campusId, campusId));
  const nodeIdBySlug = new Map(
    seedNodes.map((node) => [
      node.id,
      nodeRows.find(
        (row) =>
          nodeCoordKey(row.lat, row.lng) === nodeCoordKey(node.lat, node.lng)
      )?.id,
    ])
  );

  for (const edge of seedEdges) {
    const fromNodeId = nodeIdBySlug.get(edge.from);
    const toNodeId = nodeIdBySlug.get(edge.to);
    if (!fromNodeId || !toNodeId) {
      console.error(`  ! edge ${edge.from}→${edge.to} has no nodes — skipped`);
      continue;
    }

    const values = {
      campusId,
      fromNodeId,
      toNodeId,
      distanceM: edge.distanceM,
      hasSteps: edge.hasSteps ?? false,
      hasRamp: edge.hasRamp ?? false,
      covered: edge.covered ?? false,
      surface: edge.surface ?? ("paved" as const),
      lit: edge.lit ?? true,
    };

    await db
      .insert(pathEdges)
      .values(values)
      .onConflictDoUpdate({
        target: [pathEdges.fromNodeId, pathEdges.toNodeId],
        set: values,
      });
  }
}

async function seed() {
  assertDatabaseConfigured();

  console.log("Seeding campuses...");

  for (const campus of SEED_CAMPUSES) {
    const [row] = await db
      .insert(campuses)
      .values({
        slug: campus.slug,
        name: campus.name,
        location: campus.location,
        lat: campus.lat,
        lng: campus.lng,
        zoom: campus.zoom,
        icon: campus.icon,
      })
      .onConflictDoUpdate({
        target: campuses.slug,
        set: {
          name: campus.name,
          location: campus.location,
          lat: campus.lat,
          lng: campus.lng,
          zoom: campus.zoom,
          icon: campus.icon,
        },
      })
      .returning({ id: campuses.id });

    const campusId = row?.id;
    if (!campusId) {
      console.error(`  ! could not upsert campus ${campus.slug}`);
      continue;
    }

    const seedBuildings = SEED_BUILDINGS[campus.slug] ?? [];
    console.log(`  ${campus.name} (${campus.slug}) → ${seedBuildings.length} buildings`);

    for (const building of seedBuildings) {
      const values = {
        campusId,
        name: building.name,
        description: building.description,
        category: building.category,
        lat: building.lat,
        lng: building.lng,
        icon: building.icon,
        aliases: building.aliases,
        openingHours: building.openingHours,
        isAccessibleEntry: building.isAccessibleEntry,
      };

      const inserted = await db
        .insert(buildings)
        .values(values)
        .onConflictDoUpdate({
          target: [buildings.campusId, buildings.name],
          set: values,
        })
        .returning({ id: buildings.id });

      console.log(
        inserted.length ? `    + ${building.name}` : `    = ${building.name} (unchanged)`
      );
    }

    // Entrances reference buildings, so this has to run after they exist.
    await seedPathGraph(campusId, campus.slug);
  }

  const campusCount = await db.select({ id: campuses.id }).from(campuses);
  const buildingCount = await db.select({ id: buildings.id }).from(buildings);
  const nodeCount = await db.select({ id: pathNodes.id }).from(pathNodes);
  const edgeCount = await db.select({ id: pathEdges.id }).from(pathEdges);
  const entranceCount = await db.select({ id: entrances.id }).from(entrances);

  console.log(
    `\nDone. ${campusCount.length} campus(es), ${buildingCount.length} building(s), ` +
      `${entranceCount.length} entrance(s), ${nodeCount.length} path node(s), ${edgeCount.length} path edge(s).`
  );
}

seed()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error("Seed failed:", error);
    await pool.end();
    process.exit(1);
  });
