/**
 * The living office — a cutaway "dollhouse" cross-section of the practice.
 *
 * This module owns every Pixi object in the scene. It contains no React and no
 * store imports: `OfficeScene.tsx` reads the sim imperatively and hands the
 * state in on each tick, and forwards discrete bus events as method calls.
 *
 * Everything is drawn in a fixed "design space" whose units are chosen so a
 * person is ~46 units tall; `layout()` computes the single scale + offset that
 * fits the whole building into the viewport. That keeps every layout number in
 * this file readable and resolution independent.
 */

import { Application, Container, Graphics, Sprite, Text, TilingSprite } from 'pixi.js';
import { DAY_LENGTH_MINUTES, SLOT_MINUTES } from '../sim/balance';
// A session is a room, not a chair: `clientId` is only the seat it is filed
// under, so the scene reads the guest list through the same helper the sim does.
import { sessionMembers } from '../sim/session';
import type { GameState, PortraitSeed, ScheduledSession, SessionResult } from '../sim/types';
// Read-only authored content: which school a therapist practises from decides
// which prop stands in their room.
import { modalityById } from '../content';
import {
  DEG,
  PAL,
  SEAT_HEIGHT,
  animatePerson,
  beamTexture,
  coneTexture,
  coreTexture,
  createCat,
  createPerson,
  darken,
  drawArmchair,
  drawBookshelf,
  drawCoatRack,
  drawCoffeeMachine,
  drawContactShadow,
  drawCouch,
  drawDeskLamp,
  drawDoorPanel,
  drawDoorway,
  drawFloorLamp,
  drawFrontDoor,
  drawLowTable,
  drawModalityProp,
  drawPlant,
  drawReceptionDesk,
  drawRug,
  drawSideChair,
  drawStairwell,
  drawWallArt,
  drawWallClock,
  drawWaterCooler,
  drawWindowFrame,
  drawWindowPanes,
  dotTexture,
  glowTexture,
  grainTexture,
  hash01,
  lampHeadY,
  lighten,
  makeGlow,
  makeLabel,
  mix,
  petalTexture,
  rampColor,
  rampValue,
  setCatPose,
  setPersonFacing,
  setPersonPose,
  setPersonProp,
  sideShadeTexture,
  skyTexture,
  vignetteTexture,
  wobble,
  type CatPose,
  type CatRig,
  type PersonMode,
  type PersonProp,
  type PersonRig,
} from './sprites';

// ─────────────────────────────────────────────────────────────────────────────
// Layout constants — all in design units (a standing person is ~46 tall).
// ─────────────────────────────────────────────────────────────────────────────

const WALL = 9; // thickness of outer walls and partitions
const ROOM_H = 132; // interior height of one storey
const SLAB = 11; // floor slab under each storey
const ROOF_H = 44; // gabled roof band above the top storey
const BASE_H = 16; // foundation strip the building sits on
const BOARD = 9; // visible floorboards inside a room

const U_WAIT = 336; // waiting room / upper landing interior width
const U_THERAPY = 186; // one therapy room
const U_BREAK = 200; // break room
const U_HALL = 80; // the stairwell, its own cell — only exists on a two-storey plan

const DOOR_W = 24;
const DOOR_H = 78;

// A whole day is ~60 real seconds at 1×, so people need to cross the building
// in a couple of seconds or they would spend the day in the corridor.
const WALK_SPEED = 118; // design units per second
const CLIMB_SPEED = 96;
/** Game-minutes before their slot that a client turns up in the waiting room. */
const ARRIVE_LEAD = 12;
const MAX_VISIBLE_ROOMS = 6;

// ─────────────────────────────────────────────────────────────────────────────
// The circle
//
// A therapy room is 186 units wide and has to hold a therapist and up to six
// clients without turning into a queue. The answer is two shallow rows a half
// step apart — a near arc on the boards and a far arc six units higher — which
// is the same trick the room's furniture already uses to have any depth at all.
//
// Both arcs are pinned to the chairs the room already owns. The whole ring is a
// twelve-unit half-step grid that happens to land on 66 and 138 — the two
// armchairs the room has always had — so a circle is the 1:1 hour with chairs
// pulled up rather than a different room, and the therapist sits in it at the
// same spacing as everybody else instead of across a gap from them.
//
// It closes at 150, which keeps the floor lamp and the corner plant out of the
// circle, and it centres on 108: the little side table with the tissues on it.
// Fill order is deliberate — a room of four is a room of three with one more
// chair in it, never a fresh arrangement, it always alternates arcs so there is
// no hole in the ring, and the seat that ends up sitting on the tissue table is
// the last one taken.
// ─────────────────────────────────────────────────────────────────────────────

const GROUP_RING: { x: number; far: boolean }[] = [
  { x: 138, far: false }, // the room's own armchair — always the first seat
  { x: 126, far: true },
  { x: 114, far: false },
  { x: 150, far: true },
  { x: 102, far: true },
  { x: 90, far: false }, // clear of the therapist's armchair, which ends at 79
];

/** How much higher on the boards the far arc sits. */
const GROUP_FAR_RISE = 6;
/**
 * Actors sort on x alone, so the far arc needs a nudge to stay behind the near
 * one. Only the half-step neighbours ever overlap, so this need only exceed the
 * grid's twelve — 30 is comfortable margin and still lands well inside the room,
 * so nobody leaks behind the wall into next door.
 */
const GROUP_FAR_DEPTH = -30;
/** The far arc is fractionally smaller. Six percent is all it takes to recede. */
const GROUP_FAR_SCALE = 0.94;
/** Everyone in the circle turns toward its middle — halfway from 66 to 150. */
const GROUP_CIRCLE_CX = 108;
/** A client leans in this far in a 1:1 hour; the therapist a good deal less. */
const CLIENT_LEAN = 0.058;
/**
 * Five people leaning in at exactly the same angle read as five copies of one
 * person, so the circle varies it off each client's id — stable for the run,
 * and never quite upright.
 */
const GROUP_LEAN_SPREAD = 0.045;
/**
 * The extra chairs are carried in from the waiting room and the landing, so
 * they are the plain wooden ones and they do not match. Deliberate: five
 * matching armchairs would read as a set the practice does not own.
 */
const BORROWED_SEATS = [
  mix(PAL.sage, PAL.paper, 0.4),
  mix(PAL.plum, PAL.paperDeep, 0.42),
  mix(PAL.amber, PAL.paperDeep, 0.52),
];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// ─────────────────────────────────────────────────────────────────────────────
// Ambient ramps. t = 0 is 8:00, t = 1 is 18:00.
// ─────────────────────────────────────────────────────────────────────────────

/** Full-screen wash: cool early light → neutral noon → golden late afternoon. */
const TINT_COLOR = [
  { t: 0.0, c: 0x9dbdd6 },
  { t: 0.3, c: 0xd7e6ea },
  { t: 0.58, c: 0xf6e2b8 },
  { t: 0.82, c: 0xe8a94c },
  { t: 1.0, c: 0xc9873a },
];
const TINT_ALPHA = [
  { t: 0.0, v: 0.18 },
  { t: 0.3, v: 0.06 },
  { t: 0.58, v: 0.06 },
  { t: 0.82, v: 0.13 },
  { t: 1.0, v: 0.2 },
];
const SKY_COLOR = [
  { t: 0.0, c: 0x7c9cb6 },
  { t: 0.3, c: 0xa9c6d3 },
  { t: 0.58, c: 0xdccfa9 },
  { t: 0.82, c: 0xcf8f60 },
  { t: 1.0, c: 0x4f4a63 },
];

/**
 * The daylight a window throws onto the floor. This is the transition the whole
 * "lamplit clinic" idea hangs off: a long cool parallelogram at eight, short
 * and white by noon, gold and lengthening at four, then cold blue at dusk as
 * the lamps take the room over.
 */
const DAY_COLOR = [
  { t: 0.0, c: 0xcfe2f2 },
  { t: 0.26, c: 0xfff6e4 },
  { t: 0.55, c: 0xffeec6 },
  { t: 0.78, c: 0xffc989 },
  { t: 0.92, c: 0xc79ab0 },
  { t: 1.0, c: 0x7d95c4 },
];
const DAY_ALPHA = [
  { t: 0.0, v: 0.2 },
  { t: 0.16, v: 0.34 },
  { t: 0.5, v: 0.34 },
  { t: 0.76, v: 0.26 },
  { t: 0.9, v: 0.11 },
  { t: 1.0, v: 0.045 },
];
/** How far the shaft leans: the sun crosses from one side to the other. */
const DAY_SKEW = [
  { t: 0.0, v: 0.72 },
  { t: 0.5, v: 0.06 },
  { t: 1.0, v: -0.62 },
];
/** How wide the pool is: broad at a low sun, tight at noon. */
const DAY_SPREAD = [
  { t: 0.0, v: 1.5 },
  { t: 0.5, v: 0.86 },
  { t: 0.82, v: 1.24 },
  { t: 1.0, v: 1.6 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Model
// ─────────────────────────────────────────────────────────────────────────────

type RoomKind = 'waiting' | 'therapy' | 'break' | 'landing' | 'archive' | 'hall';
type SeatRole = 'therapist' | 'client' | 'wait' | 'couch' | 'coffee' | 'stand';

interface Seat {
  id: string;
  role: SeatRole;
  x: number;
  y: number;
  floor: number;
  facing: 1 | -1;
  sit: boolean;
  room: number;
  /** Added to the occupant's z so a far arc stays behind a near one. */
  depth?: number;
  /** Foreshortening for the far side of a circle. Undefined means full size. */
  scale?: number;
}

interface Room {
  index: number;
  kind: RoomKind;
  floor: number;
  /** Interior rect. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The walking surface — the top of the floorboards. */
  floorY: number;
  therapistId?: string;
  seats: Seat[];
}

interface DoorView {
  therapistId: string;
  panel: Graphics;
  ring: Graphics;
  cx: number;
  cy: number;
  open: number;
  target: number;
  drawnRing: number;
}

interface PathNode {
  x: number;
  y: number;
  floor: number;
}

interface Actor {
  key: string;
  kind: 'therapist' | 'client';
  refId: string;
  rig: PersonRig;
  x: number;
  y: number;
  floor: number;
  path: PathNode[];
  mode: PersonMode;
  seat: Seat | null;
  wantSeat: Seat | null;
  facing: 1 | -1;
  sleepy: boolean;
  /** Radians of forward lean — two people in session lean toward each other. */
  lean: number;
  wanderAt: number;
  /** Seconds left of the goodbye wave. */
  waveT: number;
  leaving: boolean;
  cured: boolean;
  /** Seconds until a walk-in visitor heads back out. < 0 = stays. */
  ttl: number;
  alpha: number;
  alphaTarget: number;
  /** Eased toward the seat's foreshortening, so people recede as they cross. */
  scale: number;
  /**
   * Their own walking pace, ±10%. One person's is invisible; six people's is the
   * difference between a group arriving and a group marching, because they all
   * leave the waiting room on the same intent pass.
   */
  pace: number;
}

/**
 * A lamp is never one sprite. A believable one is a tight bright core, a wide
 * soft halo, and — for the lamps that are actual objects rather than a room's
 * ambient wash — a shaft under the shade and a pool on the floorboards that
 * lengthens as the day gets later.
 */
interface LampView {
  halo: Sprite;
  core: Sprite;
  cone: Sprite | null;
  pool: Sprite | null;
  /** Peak alpha of the halo; core and pool are scaled off it. */
  base: number;
  /** Un-stretched pool width, in design units. */
  poolW: number;
  seed: number;
}

/** A shaft of daylight from one window, skewed and tinted by the clock. */
interface BeamView {
  sprite: Sprite;
  /** Width of the glass — the beam is never wider than what it comes through. */
  w: number;
  /** Distance from the sill to the floorboards. */
  drop: number;
}

/**
 * Two overlays per room. The vignette drops the corners away; the side shade
 * darkens whichever half of the room the lamp isn't on, which is what makes a
 * room read as lit BY something rather than tinted as a whole.
 */
interface RoomShade {
  vignette: Sprite;
  side: Sprite;
}

interface PlantView {
  holder: Container;
  phase: number;
  /** Bigger plants swing further and slower — the physics of a tall stem. */
  amp: number;
  rate: number;
}

/** The office cat: walks the waiting room, sits, and eventually curls up. */
interface CatState {
  rig: CatRig;
  x: number;
  y: number;
  dir: 1 | -1;
  pose: CatPose;
  /** Seconds left in the current pose. */
  hold: number;
  targetX: number;
}

interface Petal {
  sprite: Sprite;
  vx: number;
  vy: number;
  vr: number;
  life: number;
  max: number;
}

interface Wisp {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
  max: number;
  /** Own phase and frequency, so a plume curls instead of marching upward. */
  phase: number;
  curl: number;
}

interface Mote {
  sprite: Sprite;
  x: number;
  y: number;
  vy: number;
  sway: number;
  phase: number;
  base: number;
}

// ─────────────────────────────────────────────────────────────────────────────

export class OfficeWorld {
  private app: Application;

  // Layers. `world`, `lightLayer` and `fxLayer` all share the design-space
  // transform; `tint` sits between them so lamps and petals punch through it.
  readonly root = new Container();
  private skyLayer = new Container();
  private sky: Sprite;
  private skyline = new Graphics();
  private stars = new Graphics();
  private world = new Container();
  private shellG = new Graphics();
  private panesG = new Graphics();
  /**
   * The chairs a group circle borrows — the only furniture that comes and goes.
   * Two layers, because the circle straddles the room's own furniture: the far
   * arc belongs behind the armchairs and the side table, the near arc in front.
   */
  private groupFarG = new Graphics();
  private propsG = new Graphics();
  private groupNearG = new Graphics();
  private plantLayer = new Container();
  private doorLayer = new Container();
  private charLayer = new Container();
  private labelLayer = new Container();
  /** Per-room falloff, over everything in the room including the people in it. */
  private shadeLayer = new Container();
  private tint = new Graphics();
  private lightLayer = new Container();
  private fxLayer = new Container();
  /** Paper grain, in screen space, over the lot. */
  private grain: TilingSprite | null = null;

  // Screen + design geometry.
  private screenW = 1;
  private screenH = 1;
  private designW = 1;
  private designH = 1;
  private scale = 1;
  /** The viewport changed: recompute the fit transform only. */
  private needsFit = true;
  /** The building's *plan* changed: rooms, furniture and props must be redrawn. */
  private needsPlan = true;
  private sig = '';

  private rooms: Room[] = [];
  private roomByTherapist = new Map<string, Room>();
  private waitingRoom: Room | null = null;
  private breakRoom: Room | null = null;
  private doors: DoorView[] = [];
  private lamps: LampView[] = [];
  private beams: BeamView[] = [];
  private shades: RoomShade[] = [];
  private plants: PlantView[] = [];
  private labels: Text[] = [];
  private cat: CatState | null = null;
  private stairX = WALL + U_WAIT + WALL + U_HALL / 2;
  private floorCount = 1;
  /** Therapists beyond the six rooms we draw; surfaced as a "+N more" wing. */
  private overflow = 0;

  private actors = new Map<string, Actor>();
  private occupied = new Map<string, string>();

  private petals: Petal[] = [];
  private wisps: Wisp[] = [];
  private motes: Mote[] = [];
  private steamAccum = 0;

  /** Which rooms currently hold a circle, and how big — `roomIndex:count`. */
  private groupSig = '';

  private time = 0;
  private intentTimer = 0;
  /** Smoothed 0..1 "how far through the day are we" used for all ambience. */
  private ambient = 0;
  private ambientPrimed = false;
  private dusk = 0;
  private lampLevel = 0.3;
  private lastState: GameState | null = null;

  constructor(app: Application) {
    this.app = app;

    this.sky = new Sprite(skyTexture());
    this.sky.anchor.set(0, 0);
    this.skyLayer.addChild(this.sky, this.skyline, this.stars);

    this.world.addChild(
      this.shellG,
      this.panesG,
      this.groupFarG,
      this.propsG,
      this.groupNearG,
      this.plantLayer,
      this.doorLayer,
      this.charLayer,
      this.labelLayer,
      // Last, so the far corner of a room takes the people standing in it down
      // with it rather than leaving them cut out and glowing.
      this.shadeLayer,
    );

    // A single white rect we recolour by tint/alpha — never re-tessellated.
    this.tint.rect(0, 0, 1, 1).fill(0xffffff);
    this.tint.alpha = 0;

    this.root.addChild(this.skyLayer, this.world, this.tint, this.lightLayer, this.fxLayer);

    // Paper grain over the whole frame. Static, one draw call, and the single
    // cheapest thing in the scene that stops flat fills reading as UI.
    const grainTex = grainTexture();
    if (grainTex) {
      const grain = new TilingSprite({ texture: grainTex, width: 4, height: 4 });
      grain.alpha = 0.34;
      grain.eventMode = 'none';
      this.grain = grain;
      this.root.addChild(grain);
    }

    app.stage.addChild(this.root);

    // Characters are depth-sorted by floor then x so nobody pops in front of a
    // neighbour when they cross paths.
    this.charLayer.sortableChildren = true;

    this.buildMotes();
  }

  /** 0 = fresh morning, 1 = lamplit evening. The React shell mirrors this into CSS. */
  get ambientValue(): number {
    return clamp01(this.ambient + this.dusk * 0.35);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Sizing
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * The viewport changed. Room geometry lives in design space and does not
   * depend on the screen, so this only re-fits the transform and redraws the
   * screen-space backdrop. Crucially it does NOT rebuild the plan — resizing
   * the window must never teleport the people back to their spawn points.
   */
  layout(width: number, height: number): void {
    if (width < 2 || height < 2) return;
    if (width === this.screenW && height === this.screenH) return;
    this.screenW = width;
    this.screenH = height;
    this.needsFit = true;

    // Full-screen pieces.
    this.tint.scale.set(width, height);
    this.sky.width = width;
    this.sky.height = Math.max(height, 2);
    if (this.grain) {
      this.grain.width = width;
      this.grain.height = height;
    }
    this.drawSkyline();
    this.drawStars();
  }

  /**
   * Fit the whole building into the viewport. It sits low in the frame so the
   * sky above it has room to change colour through the day (and so the HUD has
   * somewhere to live without covering anyone's head).
   */
  private fit(): void {
    const s = Math.min(
      (this.screenW * 0.95) / this.designW,
      (this.screenH * 0.68) / this.designH,
      2.4,
    );
    this.scale = s;
    const ox = (this.screenW - this.designW * s) / 2;
    const oy = Math.max(this.screenH * 0.05, this.screenH * 0.92 - this.designH * s);
    for (const c of [this.world, this.lightLayer, this.fxLayer]) {
      c.scale.set(s);
      c.position.set(ox, oy);
    }
    this.needsFit = false;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Frame
  // ───────────────────────────────────────────────────────────────────────────

  update(dtMs: number, state: GameState): void {
    // Mounting inside a collapsed or hidden container means `layout()` was
    // handed a zero size; fall back to whatever the renderer settled on.
    if (this.screenW < 2 || this.screenH < 2) {
      const screen = this.app.screen;
      if (screen && screen.width > 1 && screen.height > 1) this.layout(screen.width, screen.height);
      if (this.screenW < 2 || this.screenH < 2) return;
    }

    this.lastState = state;
    const dt = Math.min(0.05, Math.max(0, dtMs) / 1000);
    this.time += dt;

    const calm = !!state.settings?.calmMode;
    const reduced = !!state.settings?.reducedMotion;

    const sig = this.signature(state);
    if (sig !== this.sig || this.needsPlan) {
      this.rebuild(state);
      this.sig = sig;
      this.needsPlan = false;
    } else if (this.needsFit) {
      this.fit();
    }

    this.updateAmbience(dt, state, calm);

    this.intentTimer -= dt;
    if (this.intentTimer <= 0) {
      this.intentTimer = 0.22;
      this.resolveIntents(state);
    }

    this.updateActors(dt, state, reduced);
    this.updateDoors(dt, state);
    this.updatePlants(dt, reduced);
    this.updateCat(dt, calm, reduced);
    this.updateFx(dt, state, calm, reduced);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Bus events
  // ───────────────────────────────────────────────────────────────────────────

  onSessionStarted(session: ScheduledSession): void {
    const room = this.roomByTherapist.get(session.therapistId);
    if (!room) return;
    const door = this.doors.find((d) => d.therapistId === session.therapistId);
    if (door) door.target = 1;
  }

  onSessionCompleted(result: SessionResult): void {
    const door = this.doors.find((d) => d.therapistId === result.therapistId);
    if (door) door.target = 0;
    // The client heads out; a cure is handled by CLIENT_CURED which fires after.
    const a = this.actors.get('c:' + result.clientId);
    if (a && !a.leaving && !result.cured) this.sendHome(a, false);
  }

  onClientCured(clientId: string, portrait?: PortraitSeed): void {
    let a = this.actors.get('c:' + clientId);
    if (!a && portrait) {
      a = this.spawnAt('c:' + clientId, 'client', clientId, portrait, this.doorPoint());
    }
    if (a) this.sendHome(a, true);
  }

  onClientArrived(clientId: string): void {
    const state = this.lastState;
    if (!state) return;
    const c = state.clients.find((x) => x.id === clientId);
    if (!c) return;
    if (this.actors.has('c:' + clientId)) return;
    const a = this.spawnAt('c:' + clientId, 'client', clientId, c.portrait, this.doorPoint());
    a.ttl = 26 + Math.random() * 14;
    const seat = this.freeSeat(['wait', 'stand'], this.waitingRoom);
    if (seat) this.sendTo(a, seat);
  }

  onDayStarted(): void {
    this.dusk = 0;
  }

  onDayEnded(): void {
    // Everyone drifts out; the room dims toward evening.
    for (const a of this.actors.values()) {
      if (a.kind === 'client' && !a.leaving) this.sendHome(a, false);
    }
    for (const d of this.doors) d.target = 0;
  }

  onPracticeLeveled(): void {
    this.needsPlan = true;
  }

  onTherapistHired(): void {
    this.needsPlan = true;
  }

  destroy(): void {
    for (const l of this.labels) l.destroy();
    this.labels = [];
    this.actors.clear();
    this.occupied.clear();
    this.cat = null;
    this.lamps = [];
    this.beams = [];
    this.shades = [];
    this.root.destroy({ children: true });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Layout: the building is rebuilt only when its shape actually changes.
  // ───────────────────────────────────────────────────────────────────────────

  private signature(state: GameState): string {
    const staff = state.therapists.filter((t) => t.status !== 'departed');
    const plants = this.plantCount(state);
    return [
      state.practiceLevel,
      staff.length,
      staff.map((t) => t.id).join('~'),
      plants,
      state.upgrades.length,
    ].join('|');
  }

  private plantCount(state: GameState): number {
    // One small plant per three alumni, plus a few for the office you've built.
    return Math.min(14, Math.floor(state.alumni.length / 3) + Math.min(5, state.upgrades.length));
  }

  private rebuild(state: GameState): void {
    const staff = state.therapists.filter((t) => t.status !== 'departed');
    const visible = Math.min(MAX_VISIBLE_ROOMS, staff.length);
    const floors = state.practiceLevel >= 4 ? 2 : 1;
    // Split the visible therapy rooms evenly over the storeys so neither floor
    // ends up with one lonely room and a corridor of dead space.
    const gN = floors === 2 ? Math.ceil(visible / 2) : Math.min(3, visible);
    const uN = floors === 2 ? visible - gN : 0;
    const overflow = staff.length - (gN + uN);
    this.floorCount = floors;
    this.overflow = overflow;

    // ── Horizontal: the ground floor sets the building width ────────────────
    // On a two-storey plan a narrow stairwell cell sits second from the left on
    // BOTH floors, so the flights meet and the plan reads as one building.
    const hall = floors === 2 ? [U_HALL] : [];
    const groundCells: number[] = [
      U_WAIT,
      ...hall,
      ...Array.from({ length: gN }, () => U_THERAPY),
      U_BREAK,
    ];
    const outerW = 2 * WALL + groundCells.reduce((a, b) => a + b, 0) + WALL * (groundCells.length - 1);

    // The upper floor fills the same width: a landing matched to the waiting
    // room, the shared stairwell, therapy rooms, then a flexible right wing.
    const upperCellCount = 3 + uN;
    const availUpper = outerW - 2 * WALL - WALL * (upperCellCount - 1);
    const archiveW = Math.max(140, availUpper - U_WAIT - U_HALL - uN * U_THERAPY);
    const upperCells: number[] = [
      U_WAIT,
      U_HALL,
      ...Array.from({ length: uN }, () => U_THERAPY),
      archiveW,
    ];

    // ── Vertical: roof band, then storeys top→bottom, then the foundation ────
    const tops: number[] = [];
    let y = ROOF_H;
    for (let f = 0; f < floors; f++) {
      tops.push(y);
      y += ROOM_H + SLAB;
    }
    this.designW = outerW;
    this.designH = y + BASE_H;
    this.fit();

    // ── Rooms ───────────────────────────────────────────────────────────────
    this.rooms = [];
    this.roomByTherapist.clear();
    this.waitingRoom = null;
    this.breakRoom = null;

    const makeFloor = (cells: number[], floorFromGround: number, kinds: RoomKind[]) => {
      const top = tops[floors - 1 - floorFromGround];
      let cx = WALL;
      cells.forEach((w, i) => {
        const room: Room = {
          index: this.rooms.length,
          kind: kinds[i],
          floor: floorFromGround,
          x: cx,
          y: top,
          w,
          h: ROOM_H,
          floorY: top + ROOM_H - BOARD,
          seats: [],
        };
        this.rooms.push(room);
        cx += w + WALL;
      });
    };

    const therapyKinds = (n: number): RoomKind[] => Array.from({ length: n }, () => 'therapy' as const);
    const hallKind: RoomKind[] = floors === 2 ? ['hall'] : [];
    makeFloor(groundCells, 0, ['waiting', ...hallKind, ...therapyKinds(gN), 'break']);
    if (floors === 2) {
      makeFloor(upperCells, 1, ['landing', 'hall', ...therapyKinds(uN), 'archive']);
    }

    // Assign therapists to therapy rooms, ground floor first.
    const therapyRooms = this.rooms.filter((r) => r.kind === 'therapy');
    therapyRooms.forEach((r, i) => {
      const t = staff[i];
      if (t) {
        r.therapistId = t.id;
        this.roomByTherapist.set(t.id, r);
      }
    });
    this.waitingRoom = this.rooms.find((r) => r.kind === 'waiting') ?? null;
    this.breakRoom = this.rooms.find((r) => r.kind === 'break') ?? null;
    const hallRoom = this.rooms.find((r) => r.kind === 'hall');
    this.stairX = hallRoom ? hallRoom.x + hallRoom.w / 2 : WALL + U_WAIT / 2;

    this.buildSeats();

    // ── Redraw everything static ────────────────────────────────────────────
    this.drawShell(state, floors, overflow);
    this.drawFurniture(state);
    this.buildDoors();
    this.buildLights();
    this.buildPlants(this.plantCount(state));
    this.buildCat();
    this.drawSkyline();
    this.drawStars();

    // Borrowed chairs are drawn in room-local coordinates that have just moved;
    // clearing the signature makes the next intent pass re-place them.
    this.groupFarG.clear();
    this.groupNearG.clear();
    this.groupSig = '';

    // Actors keep their identity but lose their (now stale) seats.
    this.occupied.clear();
    for (const a of this.actors.values()) {
      a.seat = null;
      a.wantSeat = null;
      a.scale = 1;
      a.path = [];
      a.floor = Math.min(a.floor, floors - 1);
      const ground = this.rooms.find((r) => r.floor === a.floor) ?? this.rooms[0];
      a.y = ground ? ground.floorY : this.designH - BASE_H - BOARD;
      a.x = clamp(a.x, WALL + 20, this.designW - WALL - 20);
      a.wanderAt = 0;
    }
  }

  // ── Seats ─────────────────────────────────────────────────────────────────

  private buildSeats(): void {
    for (const room of this.rooms) {
      const seats: Seat[] = [];
      const push = (role: SeatRole, x: number, facing: 1 | -1, sit: boolean) => {
        seats.push({
          id: `${room.index}:${role}:${seats.length}`,
          role,
          x: room.x + x,
          y: room.floorY,
          floor: room.floor,
          facing,
          sit,
          room: room.index,
        });
      };

      switch (room.kind) {
        case 'waiting':
          // Three chairs in the middle of the room, plus standing spots in the
          // gaps so a busy morning never runs out of somewhere to be.
          push('wait', 176, 1, true);
          push('wait', 214, 1, true);
          push('wait', 252, 1, true);
          push('stand', 62, -1, false);
          push('stand', 195, 1, false);
          push('stand', 233, -1, false);
          break;
        case 'therapy':
          push('therapist', 66, 1, true);
          push('client', 138, -1, true);
          push('stand', 102, 1, false);
          break;
        case 'break':
          push('coffee', 68, -1, false);
          push('couch', 130, 1, true);
          push('couch', 166, 1, true);
          break;
        case 'landing':
          push('stand', 122, 1, false);
          push('stand', 232, -1, false);
          break;
        case 'archive':
          push('stand', Math.min(60, room.w - 30), 1, false);
          break;
        case 'hall':
          // Nobody loiters on the stairs.
          break;
      }
      room.seats = seats;
    }
  }

  // ── The circle ────────────────────────────────────────────────────────────

  /**
   * The ring seat for member `index` of a group in `room`.
   *
   * Built on demand rather than kept on the room, because the same room runs a
   * 1:1 hour tomorrow and a permanent six-chair ring would be a lie most of the
   * week. The id is deterministic, which is all `occupied` and `sendTo` need —
   * they compare seats by id, never by identity.
   */
  private groupSeat(room: Room, index: number): Seat | null {
    const r = GROUP_RING[index];
    if (!r) return null;
    return {
      id: `${room.index}:circle:${index}`,
      role: 'client',
      x: room.x + r.x,
      y: room.floorY - (r.far ? GROUP_FAR_RISE : 0),
      floor: room.floor,
      facing: r.x < GROUP_CIRCLE_CX ? 1 : -1,
      sit: true,
      room: room.index,
      depth: r.far ? GROUP_FAR_DEPTH : 0,
      scale: r.far ? GROUP_FAR_SCALE : 1,
    };
  }

  /**
   * Put out (or take away) the borrowed chairs.
   *
   * `circles` maps a room index to how many clients are sitting in it. Redrawn
   * only when that set changes — the room's own furniture is drawn once at
   * layout time and these have to behave the same way, or a six-person circle
   * would re-tessellate five chairs sixty times a second for an hour.
   */
  private syncGroupChairs(circles: Map<number, number>): void {
    const sig = [...circles].map(([r, n]) => `${r}:${n}`).sort().join('|');
    if (sig === this.groupSig) return;
    this.groupSig = sig;

    this.groupFarG.clear();
    this.groupNearG.clear();
    for (const [roomIndex, count] of circles) {
      const room = this.rooms[roomIndex];
      if (!room || room.kind !== 'therapy') continue;
      for (let i = 1; i < Math.min(count, GROUP_RING.length); i++) {
        const r = GROUP_RING[i];
        const g = r.far ? this.groupFarG : this.groupNearG;
        const x = room.x + r.x;
        const y = room.floorY - (r.far ? GROUP_FAR_RISE : 0);
        const dir: 1 | -1 = r.x < GROUP_CIRCLE_CX ? 1 : -1;
        // Same chair, different dye lots — as true of this building as any other.
        const fabric = BORROWED_SEATS[Math.floor(hash01(x, room.index, 23) * BORROWED_SEATS.length)];
        const s = r.far ? GROUP_FAR_SCALE : 1;
        // Innermost of the three transforms `withProp` is composing, so it
        // scales the chair about its own feet before the tilt and the placing.
        withProp(g, x, y, 23 + i, () => {
          g.scaleTransform(s, s);
          drawSideChair(g, dir, fabric);
          g.scaleTransform(1 / s, 1 / s);
        });
      }
    }
  }

  // ── Shell ─────────────────────────────────────────────────────────────────

  private drawShell(state: GameState, floors: number, overflow: number): void {
    const g = this.shellG;
    g.clear();
    const W = this.designW;
    const H = this.designH;

    // Foundation + a soft ground shadow so the house is planted, not floating.
    g.ellipse(W / 2, H, W * 0.58, 16).fill({ color: PAL.night, alpha: 0.4 });
    g.roundRect(-10, H - BASE_H, W + 20, BASE_H, 3).fill(darken(PAL.inkSoft, 0.35));
    g.rect(-10, H - BASE_H, W + 20, 3).fill({ color: PAL.paperDeep, alpha: 0.25 });

    // Walls: fill the whole envelope, then punch the interiors back out.
    g.rect(0, ROOF_H - 4, W, H - ROOF_H - BASE_H + 4).fill(mix(PAL.paperDeep, PAL.inkSoft, 0.22));

    // Gabled roof.
    g.moveTo(-16, ROOF_H);
    g.lineTo(W / 2, 2);
    g.lineTo(W + 16, ROOF_H);
    g.closePath();
    g.fill(darken(PAL.inkSoft, 0.18));
    g.moveTo(-16, ROOF_H);
    g.lineTo(W / 2, 2);
    g.lineTo(W / 2, ROOF_H);
    g.closePath();
    g.fill({ color: 0xffffff, alpha: 0.06 });
    g.roundRect(-18, ROOF_H - 6, W + 36, 8, 3).fill(darken(PAL.inkSoft, 0.32));
    // Chimney.
    g.roundRect(W * 0.74, ROOF_H * 0.28, 20, ROOF_H * 0.72, 2).fill(darken(PAL.inkSoft, 0.28));
    g.roundRect(W * 0.74 - 3, ROOF_H * 0.28 - 5, 26, 6, 2).fill(darken(PAL.inkSoft, 0.4));

    // Interiors.
    for (const room of this.rooms) {
      const wall =
        room.kind === 'break'
          ? mix(PAL.paperWarm, PAL.sage, 0.16)
          : room.kind === 'waiting'
            ? PAL.paperWarm
            : room.kind === 'landing'
              ? mix(PAL.paperWarm, PAL.plum, 0.08)
              : room.kind === 'archive'
                ? mix(PAL.paperWarm, PAL.ink, 0.1)
                : room.kind === 'hall'
                  ? mix(PAL.paperWarm, PAL.woodDeep, 0.14)
                  : PAL.paper;
      g.rect(room.x, room.y, room.w, room.h).fill(wall);
      // Paint is never one flat value: it darkens toward the skirting where
      // less light reaches it. Eight bands is plenty to read as a gradient.
      const bands = 8;
      for (let b = 0; b < bands; b++) {
        const t = b / (bands - 1);
        const by = room.y + (room.h - BOARD) * (b / bands);
        const bh = (room.h - BOARD) / bands + 0.6;
        g.rect(room.x, by, room.w, bh).fill({ color: PAL.ink, alpha: 0.012 + t * t * 0.055 });
      }
      // Subtle inner shadows: a band under the ceiling and down both walls.
      g.rect(room.x, room.y, room.w, 9).fill({ color: PAL.ink, alpha: 0.09 });
      g.rect(room.x, room.y, 6, room.h).fill({ color: PAL.ink, alpha: 0.06 });
      g.rect(room.x + room.w - 6, room.y, 6, room.h).fill({ color: PAL.ink, alpha: 0.06 });

      // ── Floorboards ────────────────────────────────────────────────────────
      // Board by board, each with its own slightly wrong tone and its own
      // slightly wrong width, so the floor reads as sawn timber. All of it is
      // hashed off the board's position, so it is identical every rebuild.
      g.rect(room.x, room.floorY, room.w, BOARD).fill(PAL.wood);
      let bx = room.x;
      let bi = 0;
      while (bx < room.x + room.w) {
        const bw = Math.min(20 + hash01(bx, room.index, 31) * 12, room.x + room.w - bx);
        const tone = hash01(bx, room.index, 32);
        g.rect(bx, room.floorY, bw, BOARD).fill({
          color: tone > 0.5 ? lighten(PAL.wood, (tone - 0.5) * 0.22) : darken(PAL.wood, (0.5 - tone) * 0.2),
        });
        // The seam between boards, and a grain line down the middle of some.
        g.rect(bx + bw - 0.9, room.floorY + 1.6, 0.9, BOARD - 2).fill({
          color: PAL.woodDeep,
          alpha: 0.3,
        });
        if (bi % 3 === 0) {
          g.rect(bx + bw * 0.42, room.floorY + 3.2, bw * 0.3, 0.6).fill({
            color: PAL.woodDeep,
            alpha: 0.2,
          });
        }
        bx += bw;
        bi++;
      }
      // The lit front lip of the boards, and the shadow the wall casts on them.
      g.rect(room.x, room.floorY, room.w, 1.6).fill({ color: PAL.ink, alpha: 0.14 });
      g.rect(room.x, room.floorY + BOARD - 1.2, room.w, 1.2).fill({ color: 0xffffff, alpha: 0.16 });

      // ── Skirting board ─────────────────────────────────────────────────────
      g.rect(room.x, room.floorY - 5, room.w, 5).fill({ color: PAL.paperDeep, alpha: 0.95 });
      g.rect(room.x, room.floorY - 5, room.w, 1).fill({ color: 0xffffff, alpha: 0.4 });
      g.rect(room.x, room.floorY - 1.2, room.w, 1.2).fill({ color: PAL.ink, alpha: 0.16 });
    }

    // Stairwell: one switchback flight filling the shared hall cell. The slab
    // between the storeys is cut away so the flight reads as continuous.
    if (floors === 2) {
      const groundHall = this.rooms.find((r) => r.kind === 'hall' && r.floor === 0);
      const upperHall = this.rooms.find((r) => r.kind === 'hall' && r.floor === 1);
      if (groundHall && upperHall) {
        g.rect(groundHall.x, groundHall.y - SLAB - 2, groundHall.w, SLAB + 4).fill(
          mix(PAL.paperWarm, PAL.woodDeep, 0.14),
        );
        this.propsStairs(
          g,
          groundHall.x + 6,
          groundHall.floorY,
          groundHall.w - 12,
          groundHall.floorY - upperHall.floorY,
        );
      }
    }

    // Window panes are a separate Graphics so we can tint them with the sky.
    const p = this.panesG;
    p.clear();
    for (const room of this.rooms) {
      if (room.kind === 'therapy') {
        drawWindowPanes(p, room.x + 84, room.y + 30, 46, 32);
      } else if (room.kind === 'break') {
        drawWindowPanes(p, room.x + 130, room.y + 28, 44, 30);
      } else if (room.kind === 'landing') {
        drawWindowPanes(p, room.x + 262, room.y + 30, 44, 30);
      } else if (room.kind === 'waiting') {
        // The glass in the front door.
        drawWindowPanes(p, room.x + 14, room.floorY - 68, 20, 20);
      } else if (room.kind === 'hall' && room.floor === this.rooms.reduce((m, r) => Math.max(m, r.floor), 0)) {
        drawWindowPanes(p, room.x + room.w / 2 - 16, room.y + 22, 32, 26);
      }
    }

    // "+N more" wing label.
    for (const l of this.labels) l.destroy();
    this.labels = [];
    this.labelLayer.removeChildren();
    if (overflow > 0) {
      const wing = this.rooms.find((r) => r.kind === 'archive') ?? this.rooms[this.rooms.length - 1];
      if (wing) {
        const label = makeLabel(`+${overflow} more`, 19, PAL.inkSoft);
        label.anchor.set(0.5);
        label.x = wing.x + wing.w / 2;
        label.y = wing.y + 37;
        this.labelLayer.addChild(label);
        this.labels.push(label);
      }
    }
  }

  /** The switchback flight, authored from the bottom-left of the stairwell. */
  private propsStairs(g: Graphics, x: number, y: number, w: number, h: number): void {
    withOffset(g, x, y, () => drawStairwell(g, w, h));
  }

  // ── Furniture ─────────────────────────────────────────────────────────────

  private drawFurniture(state: GameState): void {
    const g = this.propsG;
    g.clear();
    const modalityOf = (id: string | undefined): string | null => {
      if (!id) return null;
      const t = state.therapists.find((x) => x.id === id);
      return t ? t.modality : null;
    };

    for (const room of this.rooms) {
      const f = room.floorY;
      switch (room.kind) {
        case 'waiting': {
          // Reading left to right: front door, reception, coats, chairs, table.
          withProp(g, room.x + 24, f, 1, () => drawFrontDoor(g, 30, 74));
          withOffset(g, room.x + 92, f, () => drawReceptionDesk(g, 74));
          withProp(g, room.x + 116, f - 26, 2, () => drawDeskLamp(g));
          withProp(g, room.x + 146, f, 3, () => drawCoatRack(g, 58));
          for (const s of room.seats.filter((s) => s.role === 'wait')) {
            // Nobody ever pushes a waiting-room chair back exactly square.
            withProp(g, s.x, f, 4, () => drawSideChair(g, 1));
          }
          withProp(g, room.x + 292, f, 5, () => drawLowTable(g, 40));
          withOffset(g, room.x + 322, f, () => drawWaterCooler(g));
          drawWindowFrame(g, room.x + 14, f - 68, 20, 20, true);
          drawWallArt(g, room.x + 190, room.y + 32, 36, 27, PAL.sage);
          drawWallClock(g, room.x + 270, room.y + 40, 9);
          break;
        }
        case 'therapy': {
          const rugColor = mix(PAL.brick, PAL.paperDeep, 0.35);
          withOffset(g, room.x + 102, f + 5, () => drawRug(g, 116, rugColor, room.index));
          // The modality prop goes in first so the chairs overlap it — the
          // occlusion is what gives the room any sense of depth at all.
          const modality = modalityOf(room.therapistId);
          if (modality) {
            const accent = hexToInt(modalityById[modality]?.color) ?? PAL.sage;
            withProp(g, room.x + 38, f, 6, () => drawModalityProp(g, modality, accent));
          }
          withProp(g, room.x + 66, f, 7, () => drawArmchair(g, 1, mix(PAL.sage, PAL.paperDeep, 0.25)));
          withProp(g, room.x + 138, f, 8, () => drawArmchair(g, -1, mix(PAL.plum, PAL.paperDeep, 0.3)));
          withProp(g, room.x + 168, f, 9, () => drawFloorLamp(g, 64));
          drawWindowFrame(g, room.x + 84, room.y + 30, 46, 32);
          drawWallArt(g, room.x + 40, room.y + 30, 28, 22, PAL.amber);
          // A side table between the chairs, with the tissues on it.
          drawContactShadowAt(g, room.x + 104, f, 9, 2.4);
          g.roundRect(room.x + 96, f - 21, 16, 3.4, 1.6).fill(PAL.wood);
          g.roundRect(room.x + 96, f - 21, 16, 1, 0.5).fill({ color: 0xffffff, alpha: 0.3 });
          g.rect(room.x + 102.6, f - 18, 2.8, 18).fill(PAL.woodDeep);
          g.rect(room.x + 102.6, f - 18, 0.9, 18).fill({ color: PAL.wood, alpha: 0.5 });
          g.roundRect(room.x + 99, f - 26, 7, 5, 1.6).fill(PAL.paper);
          g.roundRect(room.x + 101, f - 28, 3, 3, 1).fill(PAL.paperDeep);
          break;
        }
        case 'break': {
          withOffset(g, room.x + 44, f, () => drawCoffeeMachine(g));
          withProp(g, room.x + 148, f, 10, () => drawCouch(g, 84));
          drawWindowFrame(g, room.x + 130, room.y + 28, 44, 30);
          withProp(g, room.x + 100, f, 11, () => {
            drawContactShadow(g, 11, 2.6);
            g.roundRect(-12, -16, 24, 3, 1.4).fill(PAL.wood);
            g.roundRect(-12, -16, 24, 1, 0.5).fill({ color: 0xffffff, alpha: 0.3 });
            g.rect(-1.4, -13, 2.8, 13).fill(PAL.woodDeep);
            g.roundRect(-5, -19, 5, 3, 1.2).fill(PAL.sage);
          });
          drawWallClock(g, room.x + 96, room.y + 36, 8);
          break;
        }
        case 'landing': {
          withProp(g, room.x + 68, f, 12, () => drawBookshelf(g, 48, 78));
          drawWindowFrame(g, room.x + 262, room.y + 30, 44, 30);
          drawWallArt(g, room.x + 156, room.y + 34, 40, 30, PAL.plum);
          withProp(g, room.x + 196, f, 13, () => drawSideChair(g, -1));
          break;
        }
        case 'hall': {
          if (room.floor > 0) {
            drawWindowFrame(g, room.x + room.w / 2 - 16, room.y + 22, 32, 26);
          }
          break;
        }
        case 'archive': {
          if (this.overflow > 0) {
            // The wing stands for rooms we don't draw: a run of shut doors and
            // a plaque for the "+N more" label to sit on.
            const n = Math.min(3, Math.max(2, Math.round(room.w / 70)));
            for (let i = 0; i < n; i++) {
              const dx = room.x + 18 + (i * (room.w - 40)) / n;
              drawDoorway(g, dx, f, 22, 70);
              g.roundRect(dx, f - 70, 22, 70, 2).fill(PAL.wood);
              g.circle(dx + 17, f - 33, 1.6).fill(PAL.amberGlow);
            }
            g.roundRect(room.x + room.w / 2 - 52, room.y + 24, 104, 26, 8).fill({
              color: PAL.paper,
              alpha: 0.92,
            });
          } else {
            if (room.w > 170) {
              withProp(g, room.x + room.w / 2, f, 14, () =>
                drawBookshelf(g, Math.min(120, room.w - 60), 84),
              );
            }
            withProp(g, room.x + 34, f, 15, () => drawSideChair(g, 1));
            drawWallArt(g, room.x + room.w - 54, room.y + 30, 32, 24, PAL.amber);
          }
          break;
        }
      }

      // Every therapy room gets a doorway punched through its left partition,
      // straddling the wall so it reads as a door rather than a wardrobe.
      if (room.kind === 'therapy') {
        drawDoorway(g, room.x - WALL, room.floorY, DOOR_W, DOOR_H);
      }
    }
  }

  // ── Doors ─────────────────────────────────────────────────────────────────

  private buildDoors(): void {
    this.doorLayer.removeChildren();
    this.doors = [];
    for (const room of this.rooms) {
      if (room.kind !== 'therapy' || !room.therapistId) continue;
      const hinge = room.x - WALL;
      const panel = new Graphics();
      drawDoorPanel(panel, DOOR_W, DOOR_H);
      panel.position.set(hinge, room.floorY);
      panel.scale.x = 0.16;

      const ring = new Graphics();
      ring.position.set(hinge + DOOR_W / 2, room.floorY - DOOR_H * 0.52);
      ring.alpha = 0;

      this.doorLayer.addChild(panel, ring);
      this.doors.push({
        therapistId: room.therapistId,
        panel,
        ring,
        cx: hinge + DOOR_W / 2,
        cy: room.floorY - DOOR_H * 0.52,
        open: 0,
        target: 0,
        drawnRing: -1,
      });
    }
  }

  private updateDoors(dt: number, state: GameState): void {
    for (const d of this.doors) {
      const sess = state.schedule.find(
        (s) => s.therapistId === d.therapistId && s.status === 'active',
      );
      d.target = sess ? 1 : 0;
      d.open += (d.target - d.open) * Math.min(1, dt * 4.5);
      d.panel.scale.x = 0.16 + d.open * 0.84;
      d.ring.alpha = Math.max(0, d.open * 1.2 - 0.25);

      // A soft amber progress ring, redrawn only when it moves ~1%.
      const p = sess ? clamp01(sess.t) : d.drawnRing < 0 ? 0 : d.drawnRing;
      if (d.ring.alpha > 0.01 && Math.abs(p - d.drawnRing) > 0.012) {
        d.drawnRing = p;
        const r = 9;
        d.ring.clear();
        d.ring.circle(0, 0, r).stroke({ color: PAL.woodDeep, width: 2.6, alpha: 0.55 });
        if (p > 0.002) {
          d.ring.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
          d.ring.stroke({ color: PAL.amber, width: 2.6, cap: 'round' });
        }
        d.ring.circle(0, 0, r - 4).fill({ color: PAL.amberGlow, alpha: 0.22 });
      }
    }
  }

  // ── Lamps ─────────────────────────────────────────────────────────────────

  /**
   * Build every light in the building: the lamps themselves, the shafts of
   * daylight coming through the windows, and the falloff overlays that make a
   * room look lit by its lamp rather than washed with a flat tint.
   *
   * All of it is sprites whose alpha, tint and skew are animated per frame —
   * no geometry is ever rebuilt after this, which is what keeps the scene at
   * 60fps with nine therapists in it.
   */
  private buildLights(): void {
    for (const l of this.lamps) {
      l.halo.destroy();
      l.core.destroy();
      l.cone?.destroy();
      l.pool?.destroy();
    }
    this.lamps = [];
    for (const b of this.beams) b.sprite.destroy();
    this.beams = [];
    for (const s of this.shades) {
      s.vignette.destroy();
      s.side.destroy();
    }
    this.shades = [];
    this.lightLayer.removeChildren();
    this.shadeLayer.removeChildren();

    /**
     * A lamp: a wide soft halo, a tight bright core inside it, and — when the
     * lamp is a real object with a shade — a shaft under it and a pool on the
     * floorboards below.
     */
    const add = (
      x: number,
      y: number,
      size: number,
      base: number,
      color: number = PAL.amberGlow,
      floorY?: number,
    ) => {
      const halo = makeGlow(color, size, 0);
      halo.position.set(x, y);
      const core = new Sprite(coreTexture());
      core.anchor.set(0.5);
      core.width = size * 0.3;
      core.height = size * 0.3;
      core.tint = lighten(color, 0.35);
      core.alpha = 0;
      core.blendMode = 'add';
      core.position.set(x, y);
      this.lightLayer.addChild(halo, core);

      let cone: Sprite | null = null;
      let pool: Sprite | null = null;
      if (floorY !== undefined) {
        const drop = Math.max(12, floorY - y);
        cone = new Sprite(coneTexture());
        cone.anchor.set(0.5, 0);
        cone.width = size * 0.62;
        cone.height = drop + BOARD * 0.6;
        cone.tint = color;
        cone.alpha = 0;
        cone.blendMode = 'add';
        cone.position.set(x, y);
        pool = new Sprite(glowTexture());
        pool.anchor.set(0.5);
        pool.width = size * 0.7;
        pool.height = BOARD * 2.4;
        pool.tint = color;
        pool.alpha = 0;
        pool.blendMode = 'add';
        pool.position.set(x, floorY + BOARD * 0.45);
        this.lightLayer.addChild(cone, pool);
      }
      this.lamps.push({
        halo,
        core,
        cone,
        pool,
        base,
        poolW: size * 0.7,
        seed: hash01(x, y, 77) * 100,
      });
    };

    /** A shaft of daylight leaving a window and landing on the boards. */
    const addBeam = (cx: number, sillY: number, w: number, floorY: number) => {
      const s = new Sprite(beamTexture());
      s.anchor.set(0.5, 0);
      s.blendMode = 'add';
      s.alpha = 0;
      s.position.set(cx, sillY);
      this.lightLayer.addChild(s);
      this.beams.push({ sprite: s, w, drop: Math.max(20, floorY + BOARD * 0.6 - sillY) });
    };

    for (const room of this.rooms) {
      // A wide, faint ceiling wash so every room has a little warmth.
      add(room.x + room.w / 2, room.y + room.h * 0.42, Math.max(room.w, 200) * 1.5, 0.14);
      let lampX = room.x + room.w / 2;
      if (room.kind === 'therapy') {
        lampX = room.x + 168;
        add(lampX, room.floorY + lampHeadY(64), 160, 0.62, PAL.amberGlow, room.floorY);
        addBeam(room.x + 107, room.y + 66, 46, room.floorY);
      } else if (room.kind === 'waiting') {
        lampX = room.x + 116;
        add(lampX, room.floorY - 44, 124, 0.44, PAL.amberGlow, room.floorY);
        add(room.x + 24, room.floorY - 56, 90, 0.2, PAL.amber);
        addBeam(room.x + 24, room.floorY - 46, 22, room.floorY);
      } else if (room.kind === 'break') {
        lampX = room.x + 44;
        add(lampX, room.floorY - 52, 120, 0.34, PAL.amberGlow, room.floorY);
        addBeam(room.x + 152, room.y + 62, 44, room.floorY);
      } else if (room.kind === 'landing') {
        lampX = room.x + 176;
        add(lampX, room.y + 44, 130, 0.3);
        addBeam(room.x + 284, room.y + 64, 44, room.floorY);
      } else if (room.kind === 'hall') {
        add(lampX, room.y + 34, 100, 0.24);
        if (room.floor === this.floorCount - 1) addBeam(lampX, room.y + 52, 32, room.floorY);
      }

      // ── Falloff ────────────────────────────────────────────────────────────
      const vignette = new Sprite(vignetteTexture());
      vignette.position.set(room.x, room.y);
      vignette.width = room.w;
      vignette.height = room.h;
      vignette.alpha = 0;
      const side = new Sprite(sideShadeTexture());
      side.anchor.set(0, 0);
      side.height = room.h;
      // Point the dark end away from the lamp: the far corner from the light
      // is the one that should be losing its detail by six o'clock.
      const lampOnLeft = lampX < room.x + room.w / 2;
      side.width = room.w;
      if (!lampOnLeft) side.scale.x = -side.scale.x;
      side.position.set(lampOnLeft ? room.x : room.x + room.w, room.y);
      side.alpha = 0;
      this.shadeLayer.addChild(side, vignette);
      this.shades.push({ vignette, side });
    }

    // Dust motes live in the same layer, above the tint.
    for (const m of this.motes) this.lightLayer.addChild(m.sprite);
    this.placeMotes();
  }

  // ── Plants ────────────────────────────────────────────────────────────────

  private buildPlants(count: number): void {
    this.plantLayer.removeChildren();
    this.plants = [];
    const slots = this.plantSlots();
    for (let i = 0; i < Math.min(count, slots.length); i++) {
      const slot = slots[i];
      const holder = new Container();
      const g = new Graphics();
      drawPlant(g, slot.size, i, clamp01(0.45 + i * 0.08));
      holder.addChild(g);
      holder.position.set(slot.x, slot.y);
      this.plantLayer.addChild(holder);
      // A tall plant has a long lever and a slow return; a desk succulent
      // barely moves. Same wind, different plant.
      const k = clamp01((slot.size - 18) / 22);
      this.plants.push({
        holder,
        phase: hash01(slot.x, slot.y, 41) * Math.PI * 2,
        amp: 0.012 + k * 0.03,
        rate: 0.72 - k * 0.26,
      });
    }
  }

  /** Where plants can stand, ordered so the office fills out pleasingly. */
  private plantSlots(): { x: number; y: number; size: number }[] {
    const first: { x: number; y: number; size: number }[] = [];
    const second: { x: number; y: number; size: number }[] = [];
    for (const room of this.rooms) {
      const f = room.floorY;
      switch (room.kind) {
        // Slots are hand-placed into the gaps between the furniture so plants
        // never grow through a chair.
        case 'waiting':
          first.push({ x: room.x + 48, y: f, size: 36 });
          second.push({ x: room.x + 160, y: f, size: 24 });
          second.push({ x: room.x + 268, y: f, size: 22 });
          break;
        case 'therapy':
          first.push({ x: room.x + 22, y: f, size: 26 });
          second.push({ x: room.x + 178, y: f, size: 20 });
          break;
        case 'break':
          first.push({ x: room.x + 196, y: f, size: 26 });
          second.push({ x: room.x + 80, y: f, size: 20 });
          break;
        case 'landing':
          first.push({ x: room.x + 122, y: f, size: 32 });
          second.push({ x: room.x + 240, y: f, size: 24 });
          break;
        case 'hall':
          if (room.floor === 0) second.push({ x: room.x + room.w - 16, y: f, size: 22 });
          break;
        case 'archive':
          first.push({ x: room.x + room.w - 22, y: f, size: 28 });
          break;
      }
    }
    return [...first, ...second];
  }

  private updatePlants(dt: number, reduced: boolean): void {
    if (reduced) return;
    for (let i = 0; i < this.plants.length; i++) {
      const p = this.plants[i];
      p.phase += dt * p.rate;
      // Two frequencies so the sway never settles into an obvious loop.
      p.holder.rotation = (Math.sin(p.phase) + Math.sin(p.phase * 0.43) * 0.4) * p.amp;
    }
  }

  // ── The cat ───────────────────────────────────────────────────────────────

  /**
   * She lives in the waiting room, walks its length now and then, and spends
   * most of the day asleep on a chair. She has no effect on anything, which is
   * the correct amount of effect for a cat to have.
   */
  private buildCat(): void {
    const room = this.waitingRoom;
    if (!room) {
      this.cat = null;
      return;
    }
    const rig = this.cat?.rig ?? createCat();
    if (!this.cat) this.charLayer.addChild(rig.view);
    rig.view.zIndex = 5;
    // She keeps to the far side of the waiting room, past the desk and the
    // coats — otherwise she reads as standing on the reception counter.
    const x = clamp(this.cat?.x ?? room.x + 200, this.catMinX(room), this.catMaxX(room));
    this.cat = {
      rig,
      x,
      y: room.floorY,
      dir: 1,
      pose: 'sit',
      hold: 4,
      targetX: x,
    };
    rig.view.position.set(x, room.floorY);
    setCatPose(rig, 'sit');
  }

  private updateCat(dt: number, calm: boolean, reduced: boolean): void {
    const c = this.cat;
    const room = this.waitingRoom;
    if (!c || !room) return;
    // She is decoration, and calm mode is a promise about decoration.
    c.rig.view.visible = !calm;
    if (calm) return;

    if (reduced) {
      // Still a cat, just a very restful one.
      if (c.pose !== 'curl') {
        c.pose = 'curl';
        setCatPose(c.rig, 'curl');
        const seat = room.seats.find((s) => s.role === 'wait');
        c.x = seat ? seat.x : c.x;
        c.rig.view.position.set(c.x, room.floorY - SEAT_HEIGHT + 1);
      }
      return;
    }

    c.hold -= dt;
    if (c.pose === 'walk') {
      const dx = c.targetX - c.x;
      if (Math.abs(dx) < 2 || c.hold <= 0) {
        // Two thirds of the time she settles where she stopped; otherwise she
        // finds a chair, which is always the better chair.
        const chair = hash01(c.x, this.time, 61) < 0.34;
        const seat = chair ? this.catChair(room) : null;
        if (seat) {
          c.x = seat.x;
          c.pose = 'curl';
          c.hold = 20 + hash01(c.x, this.time, 62) * 30;
        } else {
          c.pose = 'sit';
          c.hold = 6 + hash01(c.x, this.time, 63) * 10;
        }
        setCatPose(c.rig, c.pose);
      } else {
        const dir: 1 | -1 = dx > 0 ? 1 : -1;
        c.dir = dir;
        c.x += dir * 26 * dt;
      }
    } else if (c.hold <= 0) {
      c.pose = 'walk';
      c.hold = 14;
      const lo = this.catMinX(room);
      c.targetX = lo + hash01(c.x, this.time, 64) * (this.catMaxX(room) - lo);
      setCatPose(c.rig, 'walk');
    }

    c.rig.view.scale.x = c.dir;
    const onChair = c.pose === 'curl';
    c.rig.view.position.set(c.x, room.floorY - (onChair ? SEAT_HEIGHT - 1 : 0));
    c.rig.phase += dt * (c.pose === 'walk' ? 5.5 : 1.1);
    // The tail keeps moving even when nothing else does.
    c.rig.tail.rotation = Math.sin(c.rig.phase) * (c.pose === 'walk' ? 0.16 : 0.3);
    c.rig.body.y = c.pose === 'walk' ? -Math.abs(Math.sin(c.rig.phase)) * 0.7 : 0;
    c.rig.view.zIndex = c.x;
  }

  /** Her patch of floor: right of the reception desk, left of the cooler. */
  private catMinX(room: Room): number {
    return room.x + Math.min(162, room.w * 0.48);
  }
  private catMaxX(room: Room): number {
    return room.x + Math.min(304, room.w - 32);
  }

  /** A free waiting-room chair, if there is one she can commandeer. */
  private catChair(room: Room): Seat | null {
    for (const s of room.seats) {
      if (s.role !== 'wait') continue;
      if (this.occupied.has(s.id)) continue;
      return s;
    }
    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Ambience
  // ───────────────────────────────────────────────────────────────────────────

  private updateAmbience(dt: number, state: GameState, calm: boolean): void {
    const raw = state.dayPhase === 'morning_brief' ? 0 : clamp01(state.minute / DAY_LENGTH_MINUTES);
    const duskTarget = state.dayPhase === 'day_end' ? 1 : 0;
    if (!this.ambientPrimed) {
      // Loading a save at 4pm should open on a 4pm office, not fade up from dawn.
      this.ambientPrimed = true;
      this.ambient = raw;
      this.dusk = duskTarget;
    }
    // Otherwise smooth, so the day-boundary reset reads as a sunrise not a cut.
    this.ambient += (raw - this.ambient) * Math.min(1, dt * (state.dayPhase === 'running' ? 3 : 1.1));
    this.dusk += (duskTarget - this.dusk) * Math.min(1, dt * 0.9);

    const t = this.ambient;
    let color = rampColor(TINT_COLOR, t);
    let alpha = rampValue(TINT_ALPHA, t);
    if (this.dusk > 0.001) {
      color = mix(color, PAL.plumDeep, this.dusk * 0.85);
      alpha = alpha + (0.34 - alpha) * this.dusk;
    }
    this.tint.tint = color;
    this.tint.alpha = alpha;

    // Sky + skyline.
    let skyC = rampColor(SKY_COLOR, t);
    if (this.dusk > 0.001) skyC = mix(skyC, PAL.night, this.dusk * 0.8);
    this.sky.tint = skyC;
    this.panesG.tint = lighten(skyC, 0.28);

    const night = clamp01((t - 0.72) / 0.28) * 0.9 + this.dusk * 0.5;
    this.stars.alpha = clamp01(night);

    // ── Lamps ───────────────────────────────────────────────────────────────
    // They warm up through the day and hold at full through the evening. The
    // pools on the floor stretch as the light gets lower and longer.
    this.lampLevel = clamp01(0.28 + t * t * 0.85 + this.dusk * 0.4);
    const evening = clamp01(this.ambient * 0.75 + this.dusk * 0.4);
    const flickerOn = !calm;
    const poolStretch = 1 + evening * 0.75;
    for (let i = 0; i < this.lamps.length; i++) {
      const l = this.lamps[i];
      const flicker = flickerOn ? 0.965 + Math.sin(this.time * (2.1 + (i % 5) * 0.37) + l.seed) * 0.035 : 1;
      const lit = l.base * this.lampLevel * flicker;
      l.halo.alpha = lit;
      // The core barely shows in daylight and burns through by evening — that
      // difference is most of what "a lamp came on" looks like.
      l.core.alpha = lit * (0.35 + evening * 0.85);
      if (l.cone) l.cone.alpha = lit * 0.5 * (0.2 + evening * 1.1);
      if (l.pool) {
        l.pool.alpha = lit * 0.62 * (0.22 + evening * 1.05);
        l.pool.width = l.poolW * poolStretch;
      }
    }

    // ── Daylight ────────────────────────────────────────────────────────────
    // The other half of the trade: as the lamps come up, the sun crosses the
    // floor, warms, lengthens, and goes cold.
    const beamColor = rampColor(DAY_COLOR, t);
    const beamAlpha = rampValue(DAY_ALPHA, t) * (1 - this.dusk * 0.92);
    const beamSkew = rampValue(DAY_SKEW, t);
    const beamSpread = rampValue(DAY_SPREAD, t);
    // Skewing shortens a sprite's vertical reach by cos(skew); undo that so the
    // shaft always lands ON the floorboards however far over the sun has moved.
    const beamStretch = 1 / Math.max(0.55, Math.cos(beamSkew));
    for (const b of this.beams) {
      b.sprite.tint = beamColor;
      b.sprite.alpha = beamAlpha;
      b.sprite.width = b.w * beamSpread;
      b.sprite.height = b.drop * beamStretch;
      b.sprite.skew.x = beamSkew;
    }

    // ── Falloff ─────────────────────────────────────────────────────────────
    // Corners lose their detail as the day closes in; the half of the room the
    // lamp isn't on goes cool rather than merely dark.
    const shadeTone = mix(PAL.night, PAL.plumDeep, 0.3 + evening * 0.25);
    for (const s of this.shades) {
      s.vignette.tint = shadeTone;
      s.vignette.alpha = 0.1 + evening * 0.34;
      s.side.tint = mix(shadeTone, PAL.ink, 0.3);
      s.side.alpha = 0.05 + evening * 0.2;
    }
  }

  /**
   * The town behind the practice, in three depth bands so the building reads as
   * standing in a place rather than floating. Deterministic hashes keep it
   * perfectly still between layouts.
   */
  private drawSkyline(): void {
    const g = this.skyline;
    g.clear();
    const w = this.screenW;
    const h = this.screenH;
    const baseY = h * 0.92;

    // Soft clouds high up — barely there, so they read as weather not blobs.
    for (let i = 0; i < 5; i++) {
      const cx = ((i * 3571) % 1000) / 1000;
      const cy = 0.06 + (((i * 977) % 100) / 100) * 0.2;
      const cw = 80 + ((i * 61) % 120);
      const x = cx * w;
      const y = cy * h;
      g.ellipse(x, y, cw, cw * 0.16).fill({ color: 0xffffff, alpha: 0.055 });
      g.ellipse(x + cw * 0.32, y - cw * 0.07, cw * 0.5, cw * 0.14).fill({
        color: 0xffffff,
        alpha: 0.045,
      });
    }

    // Far band — pale, low contrast.
    let x = -60;
    let i = 0;
    while (x < w + 60) {
      const bw = 54 + ((i * 37) % 80);
      const bh = 70 + ((i * 53) % 150);
      g.rect(x, baseY - bh, bw, bh + 40).fill({ color: PAL.night, alpha: 0.3 });
      x += bw + 10 + ((i * 13) % 26);
      i++;
    }

    // Near band — darker, with a scattering of lit windows.
    x = -90;
    i = 7;
    while (x < w + 60) {
      const bw = 44 + ((i * 41) % 62);
      const bh = 34 + ((i * 67) % 96);
      g.rect(x, baseY - bh, bw, bh + 40).fill({ color: PAL.night, alpha: 0.62 });
      // A pitched roof on some of them.
      if (i % 3 === 0) {
        g.moveTo(x - 5, baseY - bh);
        g.lineTo(x + bw / 2, baseY - bh - 18);
        g.lineTo(x + bw + 5, baseY - bh);
        g.closePath();
        g.fill({ color: PAL.night, alpha: 0.62 });
      }
      for (let k = 0; k < 3; k++) {
        if ((i * 7 + k * 11) % 4 === 0) {
          g.rect(x + 9 + k * 14, baseY - bh + 14 + ((k * 19) % 34), 5, 7).fill({
            color: PAL.amber,
            alpha: 0.32,
          });
        }
      }
      x += bw + 8 + ((i * 17) % 20);
      i++;
    }

    // Ground the building sits on, plus a low hedge along the front.
    g.rect(0, baseY, w, h - baseY + 4).fill({ color: PAL.night, alpha: 0.85 });
    for (let b = 0; b * 74 < w + 74; b++) {
      const bx = b * 74 + ((b * 29) % 26);
      g.ellipse(bx, baseY + 6, 34, 15).fill({ color: darken(PAL.sageDeep, 0.55), alpha: 0.9 });
    }
  }

  private drawStars(): void {
    const g = this.stars;
    g.clear();
    const w = this.screenW;
    const h = this.screenH * 0.62;
    for (let i = 0; i < 46; i++) {
      // Cheap hash so the sky is stable between layouts.
      const fx = ((i * 9301 + 49297) % 233280) / 233280;
      const fy = ((i * 4177 + 12345) % 233280) / 233280;
      const r = 0.7 + (((i * 31) % 7) / 7) * 1.1;
      g.circle(fx * w, fy * h, r).fill({ color: 0xffffff, alpha: 0.35 + ((i % 4) / 4) * 0.5 });
    }
    // A low moon.
    g.circle(w * 0.83, h * 0.22, 16).fill({ color: PAL.amberGlow, alpha: 0.5 });
    g.circle(w * 0.83, h * 0.22, 26).fill({ color: PAL.amberGlow, alpha: 0.1 });
    g.alpha = 0;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Actors
  // ───────────────────────────────────────────────────────────────────────────

  private doorPoint(): PathNode {
    const r = this.waitingRoom;
    if (!r) return { x: this.designW * 0.1, y: this.designH - BASE_H - BOARD, floor: 0 };
    return { x: r.x + 32, y: r.floorY, floor: 0 };
  }

  private spawnAt(
    key: string,
    kind: 'therapist' | 'client',
    refId: string,
    seed: PortraitSeed,
    at: PathNode,
  ): Actor {
    const rig = createPerson(seed);
    rig.view.position.set(at.x, at.y);
    rig.view.alpha = 0;
    this.charLayer.addChild(rig.view);
    const a: Actor = {
      key,
      kind,
      refId,
      rig,
      x: at.x,
      y: at.y,
      floor: at.floor,
      path: [],
      mode: 'idle',
      seat: null,
      wantSeat: null,
      facing: 1,
      sleepy: false,
      lean: 0,
      wanderAt: 0,
      waveT: 0,
      leaving: false,
      cured: false,
      ttl: -1,
      alpha: 0,
      alphaTarget: 1,
      scale: 1,
      pace: 1 + wobble(idSeed(refId), 0, 91, 0.1),
    };
    this.actors.set(key, a);
    return a;
  }

  private ensureActor(
    key: string,
    kind: 'therapist' | 'client',
    refId: string,
    seed: PortraitSeed,
    at: PathNode,
  ): Actor {
    const existing = this.actors.get(key);
    if (existing) return existing;
    return this.spawnAt(key, kind, refId, seed, at);
  }

  private removeActor(a: Actor): void {
    this.releaseSeat(a);
    a.rig.view.destroy({ children: true });
    this.actors.delete(a.key);
  }

  /** Fade an actor out over the next moment, then drop them. */
  private retire(key: string): void {
    const a = this.actors.get(key);
    if (!a) return;
    a.alphaTarget = 0;
    a.leaving = true;
    a.path = [];
    this.releaseSeat(a);
    if (a.alpha <= 0.02) this.removeActor(a);
  }

  private releaseSeat(a: Actor): void {
    if (a.seat && this.occupied.get(a.seat.id) === a.key) this.occupied.delete(a.seat.id);
    if (a.wantSeat && this.occupied.get(a.wantSeat.id) === a.key) this.occupied.delete(a.wantSeat.id);
    a.seat = null;
    a.wantSeat = null;
  }

  /** First unoccupied seat matching any of `roles`, optionally within a room. */
  private freeSeat(roles: SeatRole[], room: Room | null): Seat | null {
    const pool = room ? [room] : this.rooms;
    for (const r of pool) {
      for (const s of r.seats) {
        if (!roles.includes(s.role)) continue;
        if (this.occupied.has(s.id)) continue;
        return s;
      }
    }
    return null;
  }

  private sendTo(a: Actor, seat: Seat): void {
    if (a.wantSeat && a.wantSeat.id === seat.id) return;
    // Two people must never end up on the same chair: whoever was there is
    // bumped and will pick somewhere else on the next intent pass.
    const holder = this.occupied.get(seat.id);
    if (holder && holder !== a.key) {
      const other = this.actors.get(holder);
      if (other) {
        this.releaseSeat(other);
        other.wanderAt = 0;
      }
    }
    this.releaseSeat(a);
    this.occupied.set(seat.id, a.key);
    a.wantSeat = seat;
    a.path = this.pathTo(a, seat.x, seat.y, seat.floor);
  }

  private sendHome(a: Actor, cured: boolean): void {
    this.releaseSeat(a);
    a.leaving = true;
    a.cured = cured;
    a.ttl = -1;
    const d = this.doorPoint();
    a.path = this.pathTo(a, d.x, d.y, 0);
  }

  /** L-shaped route; a floor change is a single vertical hop at the stairwell. */
  private pathTo(a: Actor, x: number, y: number, floor: number): PathNode[] {
    const nodes: PathNode[] = [];
    if (floor !== a.floor) {
      const from = this.rooms.find((r) => r.floor === a.floor);
      const to = this.rooms.find((r) => r.floor === floor);
      nodes.push({ x: this.stairX, y: from ? from.floorY : a.y, floor: a.floor });
      nodes.push({ x: this.stairX, y: to ? to.floorY : y, floor });
    }
    nodes.push({ x, y, floor });
    return nodes;
  }

  private resolveIntents(state: GameState): void {
    const running = state.dayPhase === 'running';
    const now = this.time;
    const seen = new Set<string>();

    // Sessions indexed by therapist and by client — cheap, and this runs at 4 Hz.
    // Indexing on `s.clientId` alone was the bug that drew a room of five as one
    // chair: every other member of a group was invisible to the scene, so they
    // never walked in and never sat down.
    const activeByTherapist = new Map<string, ScheduledSession>();
    const byClient = new Map<string, ScheduledSession>();
    /** Rooms with a circle in them right now → how many chairs it needs. */
    const circles = new Map<number, number>();
    for (const s of state.schedule) {
      if (s.status === 'active') activeByTherapist.set(s.therapistId, s);
      if (s.status !== 'active' && s.status !== 'scheduled') continue;
      const members = sessionMembers(s);
      for (const id of members) byClient.set(id, s);
      if (s.status === 'active' && members.length > 1) {
        const room = this.roomByTherapist.get(s.therapistId);
        if (room) circles.set(room.index, Math.min(members.length, GROUP_RING.length));
      }
    }
    this.syncGroupChairs(circles);

    // ── Therapists ──────────────────────────────────────────────────────────
    for (const t of state.therapists) {
      if (t.status === 'departed') continue;
      const key = 't:' + t.id;
      if (t.status === 'training' || t.status === 'sabbatical' || t.status === 'conference') {
        this.retire(key);
        continue;
      }
      seen.add(key);
      const room = this.roomByTherapist.get(t.id);
      const home: PathNode = room
        ? { x: room.x + 44, y: room.floorY, floor: room.floor }
        : this.doorPoint();
      const a = this.ensureActor(key, 'therapist', t.id, t.portrait, home);
      a.alphaTarget = 1;
      a.leaving = false;
      // Tired before noon reads as a small slump and half-closed eyes.
      a.sleepy = t.energy < t.maxEnergy * 0.36 && state.minute < DAY_LENGTH_MINUTES * 0.42;

      const sess = activeByTherapist.get(t.id);
      if (sess && room) {
        const seat = room.seats.find((s) => s.role === 'therapist');
        if (seat) this.sendTo(a, seat);
        // The listening tilt: forward, and a good deal less than the client's.
        a.lean = 0.042;
        continue;
      }
      a.lean = 0;
      if (!running) continue;
      if (now < a.wanderAt) continue;
      a.wanderAt = now + 8 + Math.random() * 13;
      const tired = t.energy < t.maxEnergy * 0.55;
      let seat: Seat | null = null;
      if (Math.random() < (tired ? 0.58 : 0.32)) seat = this.freeSeat(['couch', 'coffee'], this.breakRoom);
      if (!seat && room) seat = this.freeSeat(['stand', 'therapist'], room);
      if (!seat) seat = this.freeSeat(['stand'], null);
      if (seat) this.sendTo(a, seat);
    }

    // ── Clients ─────────────────────────────────────────────────────────────
    for (const c of state.clients) {
      if (c.status !== 'active') continue;
      const sess = byClient.get(c.id);
      if (!sess) continue;
      const key = 'c:' + c.id;
      const startMin = sess.slot * SLOT_MINUTES;

      if (sess.status === 'active') {
        seen.add(key);
        const room = this.roomByTherapist.get(sess.therapistId);
        const a = this.ensureActor(key, 'client', c.id, c.portrait, this.doorPoint());
        if (a.leaving) continue;
        a.ttl = -1;
        a.alphaTarget = 1;
        // A room has exactly one 'client' seat, built with the furniture. Anyone
        // beyond the first sits on the ring, which only exists while they do.
        const members = sessionMembers(sess);
        const seat = !room
          ? null
          : members.length > 1
            ? this.groupSeat(room, members.indexOf(c.id))
            : (room.seats.find((s) => s.role === 'client') ?? null);
        if (seat) this.sendTo(a, seat);
        // Leaning in, a little more than the therapist does — and in a circle,
        // never by quite the same amount as the person next to them.
        a.lean =
          members.length > 1
            ? CLIENT_LEAN + wobble(idSeed(c.id), 0, 89, GROUP_LEAN_SPREAD)
            : CLIENT_LEAN;
      } else if (running && state.minute >= startMin - ARRIVE_LEAD) {
        seen.add(key);
        const a = this.ensureActor(key, 'client', c.id, c.portrait, this.doorPoint());
        if (a.leaving) continue;
        a.ttl = -1;
        a.alphaTarget = 1;
        a.lean = 0;
        if (!a.wantSeat) {
          const seat = this.freeSeat(['wait', 'stand'], this.waitingRoom);
          if (seat) this.sendTo(a, seat);
        }
      }
    }

    // Anyone still in the building with nothing to do heads out.
    for (const a of [...this.actors.values()]) {
      if (a.kind !== 'client') continue;
      if (a.leaving || a.ttl >= 0) continue;
      if (!seen.has(a.key)) this.sendHome(a, false);
    }
  }

  private updateActors(dt: number, state: GameState, reduced: boolean): void {
    const frozen = state.dayPhase !== 'running';

    for (const a of [...this.actors.values()]) {
      // Visitors who came to look around eventually leave again.
      if (a.ttl >= 0) {
        a.ttl -= dt;
        if (a.ttl <= 0) {
          a.ttl = -1;
          this.sendHome(a, false);
        }
      }

      let mode: PersonMode = a.mode;

      if (a.waveT > 0) {
        a.waveT -= dt;
        mode = 'wave';
        if (a.waveT <= 0) a.alphaTarget = 0;
      } else if (a.path.length && !(frozen && !a.leaving)) {
        const n = a.path[0];
        if (n.floor !== a.floor) {
          // Stair hop.
          const dy = n.y - a.y;
          const step = CLIMB_SPEED * a.pace * dt;
          a.x += (n.x - a.x) * Math.min(1, dt * 5);
          if (Math.abs(dy) <= step) {
            a.y = n.y;
            a.floor = n.floor;
            a.path.shift();
          } else {
            a.y += Math.sign(dy) * step;
          }
          mode = 'walk';
        } else {
          const dx = n.x - a.x;
          const step = WALK_SPEED * a.pace * dt;
          a.y += (n.y - a.y) * Math.min(1, dt * 6);
          if (Math.abs(dx) <= step) {
            a.x = n.x;
            a.path.shift();
            if (!a.path.length) {
              if (a.leaving) {
                if (a.cured && !state.settings?.reducedMotion) {
                  a.waveT = 1.7;
                  this.burstPetals(a.x, a.y - 30, state);
                } else {
                  a.alphaTarget = 0;
                }
                mode = a.cured ? 'wave' : 'idle';
              } else if (a.wantSeat) {
                a.seat = a.wantSeat;
                a.facing = a.wantSeat.facing;
                // The walk eases y toward the seat rather than stepping it, so
                // a seat off the floor line needs settling exactly.
                a.y = a.wantSeat.y;
                mode = a.wantSeat.sit ? 'sit' : 'idle';
              }
            }
          } else {
            const dir: 1 | -1 = dx > 0 ? 1 : -1;
            a.x += dir * step;
            a.facing = dir;
            mode = 'walk';
          }
        }
      } else if (a.seat) {
        mode = a.seat.sit ? 'sit' : 'idle';
      } else if (!a.leaving) {
        mode = 'idle';
      }

      // Fade in / out.
      a.alpha += (a.alphaTarget - a.alpha) * Math.min(1, dt * 4.5);
      a.rig.view.alpha = a.alpha;
      if (a.alphaTarget === 0 && a.alpha < 0.02) {
        this.removeActor(a);
        continue;
      }

      a.mode = mode;
      // Where they are headed decides how big they are, not where they are:
      // somebody crossing to the far side of a circle should recede on the way
      // rather than snap the moment they sit down.
      const dest = a.wantSeat ?? a.seat;
      const wantScale = dest?.scale ?? 1;
      a.scale += (wantScale - a.scale) * Math.min(1, dt * 5);
      // Feet sit on the floorboards; the chair geometry is drawn behind them.
      a.rig.view.position.set(a.x, a.y);
      a.rig.view.scale.set(a.scale);
      setPersonPose(a.rig, mode === 'sit' ? 'sit' : 'stand', a.sleepy && mode !== 'walk');
      setPersonFacing(a.rig, a.facing);
      // A lean only reads when someone is settled; walking with one looks drunk.
      a.rig.lean = mode === 'sit' ? a.lean : 0;
      setPersonProp(a.rig, this.propFor(a, mode));
      animatePerson(a.rig, dt, mode, reduced);
      // Upper floors draw over lower ones; within a floor, right over left —
      // plus a seat's own bias, which is what holds the far arc of a circle
      // behind the near one when the two interleave in x.
      a.rig.view.zIndex = a.floor * 10000 + a.x + (dest?.depth ?? 0);
    }
  }

  /**
   * What someone is doing with their hands. Waiting rooms are full of people
   * killing eleven minutes, and "sat perfectly still facing forward" is the one
   * thing nobody in a waiting room is actually doing.
   *
   * Bucketed on a slow clock so a person keeps the same magazine for a while
   * rather than flickering between activities every frame.
   */
  private propFor(a: Actor, mode: PersonMode): PersonProp {
    if (mode !== 'sit' || !a.seat) return 'none';
    if (a.leaving) return 'none';
    const bucket = Math.floor(this.time / 24);
    if (a.seat.role === 'wait') {
      const h = hash01(a.seat.x, bucket, 71);
      return h < 0.38 ? 'phone' : h < 0.68 ? 'magazine' : 'none';
    }
    // Whoever made it to the break room has earned the mug.
    if (a.seat.role === 'couch' || a.seat.role === 'coffee') return 'mug';
    return 'none';
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FX: dust motes, coffee steam, goodbye petals
  // ───────────────────────────────────────────────────────────────────────────

  private buildMotes(): void {
    const tex = dotTexture();
    for (let i = 0; i < 25; i++) {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.tint = PAL.amberGlow;
      s.blendMode = 'add';
      const size = 2 + Math.random() * 3;
      s.width = size;
      s.height = size;
      this.motes.push({
        sprite: s,
        x: 0,
        y: 0,
        vy: 4 + Math.random() * 8,
        sway: 3 + Math.random() * 6,
        phase: Math.random() * Math.PI * 2,
        base: 0.25 + Math.random() * 0.45,
      });
    }
  }

  /** Scatter the motes through the lamplit rooms after a relayout. */
  private placeMotes(): void {
    const rooms = this.rooms.filter((r) => r.kind === 'therapy' || r.kind === 'waiting');
    const pool = rooms.length ? rooms : this.rooms;
    this.motes.forEach((m, i) => {
      const r = pool[i % Math.max(1, pool.length)];
      if (!r) return;
      m.x = r.x + 20 + Math.random() * (r.w - 40);
      m.y = r.y + 20 + Math.random() * (r.h - 30);
      m.sprite.position.set(m.x, m.y);
    });
  }

  private burstPetals(x: number, y: number, state: GameState): void {
    if (state.settings?.calmMode || state.settings?.reducedMotion) return;
    const tex = petalTexture();
    const colors = [PAL.amber, PAL.brickSoft, PAL.sage, PAL.amberGlow, PAL.plum];
    for (let i = 0; i < 18; i++) {
      let p = this.petals.find((q) => q.life <= 0);
      if (!p) {
        if (this.petals.length >= 46) break;
        const s = new Sprite(tex);
        s.anchor.set(0.5);
        this.fxLayer.addChild(s);
        p = { sprite: s, vx: 0, vy: 0, vr: 0, life: 0, max: 1 };
        this.petals.push(p);
      }
      const a = Math.random() * Math.PI * 2;
      const speed = 22 + Math.random() * 52;
      p.sprite.position.set(x, y);
      p.sprite.tint = colors[i % colors.length];
      const size = 4 + Math.random() * 4;
      p.sprite.width = size;
      p.sprite.height = size * 1.3;
      p.sprite.rotation = a;
      p.sprite.alpha = 1;
      p.sprite.visible = true;
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed - 34;
      p.vr = (Math.random() - 0.5) * 6;
      p.max = 1.5 + Math.random();
      p.life = p.max;
    }
  }

  private updateFx(dt: number, state: GameState, calm: boolean, reduced: boolean): void {
    // ── Dust motes ────────────────────────────────────────────────────────
    const showMotes = !calm && !reduced;
    for (const m of this.motes) {
      m.sprite.visible = showMotes;
      if (!showMotes) continue;
      m.phase += dt;
      m.y -= m.vy * dt;
      const room = this.rooms.find(
        (r) => m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y - 4 && m.y <= r.floorY + BOARD,
      );
      if (!room) {
        // Recycle to the bottom of a lamplit room.
        const pool = this.rooms.filter((r) => r.kind === 'therapy' || r.kind === 'waiting');
        const r = (pool.length ? pool : this.rooms)[Math.floor(Math.random() * Math.max(1, pool.length || this.rooms.length))];
        if (r) {
          m.x = r.x + 20 + Math.random() * (r.w - 40);
          m.y = r.floorY - 2;
        }
      }
      m.sprite.position.set(m.x + Math.sin(m.phase * 0.8) * m.sway, m.y);
      m.sprite.alpha = m.base * this.lampLevel * (0.55 + 0.45 * Math.sin(m.phase * 1.7));
    }

    // ── Coffee steam ──────────────────────────────────────────────────────
    const br = this.breakRoom;
    let someoneInBreak = false;
    if (br) {
      for (const a of this.actors.values()) {
        if (a.seat && a.seat.room === br.index) {
          someoneInBreak = true;
          break;
        }
      }
    }
    if (br && someoneInBreak && state.dayPhase === 'running' && !reduced) {
      this.steamAccum += dt * 7;
      while (this.steamAccum >= 1) {
        this.steamAccum -= 1;
        this.emitWisp(br.x + 40 + Math.random() * 8, br.floorY - 50);
      }
    } else {
      this.steamAccum = 0;
    }
    for (const w of this.wisps) {
      if (w.life <= 0) continue;
      w.life -= dt;
      if (w.life <= 0) {
        w.sprite.visible = false;
        continue;
      }
      const age = w.max - w.life;
      w.phase += dt * w.curl;
      // Steam does not go up in a line. It wanders sideways, loses its heat,
      // slows, and spreads out into nothing.
      const drift = Math.sin(w.phase) + Math.sin(w.phase * 0.61 + 1.3) * 0.5;
      w.sprite.x += (w.vx + drift * (5 + age * 9)) * dt;
      w.sprite.y += w.vy * dt;
      // Rising air cools and slows as it climbs.
      w.vy += 9 * dt;
      const k = w.life / w.max;
      w.sprite.alpha = k * k * 0.42;
      const size = 8 + (1 - k) * 30;
      w.sprite.width = size;
      w.sprite.height = size * (1 - (1 - k) * 0.25);
    }

    // ── Goodbye petals ────────────────────────────────────────────────────
    for (const p of this.petals) {
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      p.life -= dt;
      p.vy += 62 * dt;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.sprite.rotation += p.vr * dt;
      p.sprite.alpha = clamp01(p.life / (p.max * 0.6));
      if (p.life <= 0) p.sprite.visible = false;
    }
  }

  private emitWisp(x: number, y: number): void {
    let w = this.wisps.find((q) => q.life <= 0);
    if (!w) {
      if (this.wisps.length >= 16) return;
      const s = new Sprite(glowTexture());
      s.anchor.set(0.5);
      s.tint = PAL.paper;
      s.blendMode = 'add';
      this.fxLayer.addChild(s);
      w = { sprite: s, vx: 0, vy: 0, life: 0, max: 1, phase: 0, curl: 1 };
      this.wisps.push(w);
    }
    w.sprite.position.set(x, y);
    w.sprite.visible = true;
    w.vx = (Math.random() - 0.5) * 8;
    w.vy = -20 - Math.random() * 12;
    w.phase = Math.random() * Math.PI * 2;
    w.curl = 1.6 + Math.random() * 1.6;
    w.max = 1.8 + Math.random() * 0.9;
    w.life = w.max;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Small drawing helpers that need the room's origin.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Draw a prop that is authored around its own origin at an arbitrary point.
 *
 * Every prop helper in sprites.ts is authored standing on (0, 0). Pixi v8's
 * GraphicsContext carries a transform that is baked into each shape as it is
 * built, and `translateTransform` is purely additive on tx/ty — so translating
 * out and back leaves the context exactly as we found it. That lets the whole
 * office share one Graphics object instead of one Container per prop.
 */
function withOffset(g: Graphics, x: number, y: number, draw: () => void): void {
  g.translateTransform(x, y);
  draw();
  g.translateTransform(-x, -y);
}

/**
 * The same, but with a deterministic tilt of up to a degree, hashed off where
 * the prop stands. Real furniture is never square to the room, and that tiny
 * wrongness is most of the difference between "illustrated" and "generated".
 *
 * Pixi's transform ops pre-multiply, so `rotate` then `translate` composes to
 * "rotate the prop about its own feet, then stand it at (x, y)" — and undoing
 * them in reverse leaves the shared context exactly as we found it.
 */
function withProp(g: Graphics, x: number, y: number, salt: number, draw: () => void): void {
  const r = wobble(x, y, salt, 1 * DEG);
  g.rotateTransform(r);
  g.translateTransform(x, y);
  draw();
  g.translateTransform(-x, -y);
  g.rotateTransform(-r);
}

/** A contact shadow for furniture drawn inline rather than through a helper. */
function drawContactShadowAt(g: Graphics, x: number, y: number, w: number, h: number): void {
  withOffset(g, x, y, () => drawContactShadow(g, w, h));
}

/**
 * A stable number from an entity id, so `wobble` can key off one. Client ids are
 * minted from `state.idSeq`, which makes this steady for the whole run — the
 * same person leans in by the same amount every hour of every week.
 */
function idSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 4093;
}

/** `#RRGGBB` from the content pack → a packed Pixi colour. */
function hexToInt(hex: string | undefined): number | null {
  if (!hex) return null;
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return Number.isFinite(n) ? n : null;
}

/** Re-exported so room maths and chair geometry stay in sync. */
export { SEAT_HEIGHT };
