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

import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import { DAY_LENGTH_MINUTES, SESSION_MINUTES, SLOT_MINUTES } from '../sim/balance';
import type { GameState, PortraitSeed, ScheduledSession, SessionResult } from '../sim/types';
import {
  PAL,
  SEAT_HEIGHT,
  animatePerson,
  createPerson,
  darken,
  drawArmchair,
  drawBookshelf,
  drawCoatRack,
  drawCoffeeMachine,
  drawCouch,
  drawDeskLamp,
  drawDoorPanel,
  drawDoorway,
  drawFloorLamp,
  drawFrontDoor,
  drawLowTable,
  drawPlant,
  drawReceptionDesk,
  drawRug,
  drawShadow,
  drawSideChair,
  drawStairwell,
  drawWallArt,
  drawWallClock,
  drawWaterCooler,
  drawWindowFrame,
  drawWindowPanes,
  dotTexture,
  glowTexture,
  lampHeadY,
  lighten,
  makeGlow,
  makeLabel,
  mix,
  petalTexture,
  rampColor,
  rampValue,
  setPersonFacing,
  setPersonPose,
  skyTexture,
  type PersonMode,
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
  { t: 0.0, v: 0.2 },
  { t: 0.3, v: 0.07 },
  { t: 0.58, v: 0.07 },
  { t: 0.82, v: 0.16 },
  { t: 1.0, v: 0.26 },
];
const SKY_COLOR = [
  { t: 0.0, c: 0x7c9cb6 },
  { t: 0.3, c: 0xa9c6d3 },
  { t: 0.58, c: 0xdccfa9 },
  { t: 0.82, c: 0xcf8f60 },
  { t: 1.0, c: 0x4f4a63 },
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
  wanderAt: number;
  /** Seconds left of the goodbye wave. */
  waveT: number;
  leaving: boolean;
  cured: boolean;
  /** Seconds until a walk-in visitor heads back out. < 0 = stays. */
  ttl: number;
  alpha: number;
  alphaTarget: number;
}

interface LampView {
  sprite: Sprite;
  base: number;
  seed: number;
}

interface PlantView {
  holder: Container;
  phase: number;
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
  private propsG = new Graphics();
  private plantLayer = new Container();
  private doorLayer = new Container();
  private charLayer = new Container();
  private labelLayer = new Container();
  private tint = new Graphics();
  private lightLayer = new Container();
  private fxLayer = new Container();

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
  private plants: PlantView[] = [];
  private labels: Text[] = [];
  private stairX = WALL + U_WAIT + WALL + U_HALL / 2;
  private floorCount = 1;

  private actors = new Map<string, Actor>();
  private occupied = new Map<string, string>();

  private petals: Petal[] = [];
  private wisps: Wisp[] = [];
  private motes: Mote[] = [];
  private steamAccum = 0;

  private time = 0;
  private intentTimer = 0;
  /** Smoothed 0..1 "how far through the day are we" used for all ambience. */
  private ambient = 0;
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
      this.propsG,
      this.plantLayer,
      this.doorLayer,
      this.charLayer,
      this.labelLayer,
    );

    // A single white rect we recolour by tint/alpha — never re-tessellated.
    this.tint.rect(0, 0, 1, 1).fill(0xffffff);
    this.tint.alpha = 0;

    this.root.addChild(this.skyLayer, this.world, this.tint, this.lightLayer, this.fxLayer);
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
    this.buildLamps();
    this.buildPlants(this.plantCount(state));
    this.drawSkyline();
    this.drawStars();

    // Actors keep their identity but lose their (now stale) seats.
    this.occupied.clear();
    for (const a of this.actors.values()) {
      a.seat = null;
      a.wantSeat = null;
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
      // Subtle inner shadows: a band under the ceiling and down both walls.
      g.rect(room.x, room.y, room.w, 9).fill({ color: PAL.ink, alpha: 0.09 });
      g.rect(room.x, room.y, 6, room.h).fill({ color: PAL.ink, alpha: 0.06 });
      g.rect(room.x + room.w - 6, room.y, 6, room.h).fill({ color: PAL.ink, alpha: 0.06 });
      // Floorboards + baseboard.
      g.rect(room.x, room.floorY, room.w, BOARD).fill(PAL.wood);
      g.rect(room.x, room.floorY, room.w, 2).fill({ color: PAL.woodDeep, alpha: 0.5 });
      for (let bx = room.x + 22; bx < room.x + room.w; bx += 26) {
        g.rect(bx, room.floorY + 2.5, 1, BOARD - 3).fill({ color: PAL.woodDeep, alpha: 0.28 });
      }
      g.rect(room.x, room.floorY - 4, room.w, 4).fill({ color: PAL.paperDeep, alpha: 0.9 });
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
        const label = makeLabel(`+${overflow} more`, 20, PAL.inkFaint);
        label.anchor.set(0.5);
        label.x = wing.x + wing.w / 2;
        label.y = wing.y + wing.h / 2 - 6;
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

    for (const room of this.rooms) {
      const f = room.floorY;
      switch (room.kind) {
        case 'waiting': {
          // Reading left to right: front door, reception, coats, chairs, table.
          withOffset(g, room.x + 24, f, () => drawFrontDoor(g, 30, 74));
          withOffset(g, room.x + 92, f, () => drawReceptionDesk(g, 74));
          withOffset(g, room.x + 116, f - 26, () => drawDeskLamp(g));
          withOffset(g, room.x + 146, f, () => drawCoatRack(g, 58));
          for (const s of room.seats.filter((s) => s.role === 'wait')) {
            withOffset(g, s.x, f, () => drawSideChair(g, 1));
          }
          withOffset(g, room.x + 292, f, () => drawLowTable(g, 40));
          withOffset(g, room.x + 322, f, () => drawWaterCooler(g));
          drawWindowFrame(g, room.x + 14, f - 68, 20, 20, true);
          drawWallArt(g, room.x + 190, room.y + 32, 36, 27, PAL.sage);
          drawWallClock(g, room.x + 270, room.y + 40, 9);
          break;
        }
        case 'therapy': {
          const rugColor = mix(PAL.brick, PAL.paperDeep, 0.35);
          withOffset(g, room.x + 102, f + 5, () => drawRug(g, 116, rugColor));
          withOffset(g, room.x + 66, f, () => drawArmchair(g, 1, mix(PAL.sage, PAL.paperDeep, 0.25)));
          withOffset(g, room.x + 138, f, () => drawArmchair(g, -1, mix(PAL.plum, PAL.paperDeep, 0.3)));
          withOffset(g, room.x + 168, f, () => drawFloorLamp(g, 64));
          drawWindowFrame(g, room.x + 84, room.y + 30, 46, 32);
          drawWallArt(g, room.x + 40, room.y + 30, 28, 22, PAL.amber);
          // A side table between the chairs, with the tissues on it.
          g.roundRect(room.x + 96, f - 21, 16, 3.4, 1.6).fill(PAL.wood);
          g.rect(room.x + 102.6, f - 18, 2.8, 18).fill(PAL.woodDeep);
          g.roundRect(room.x + 99, f - 26, 7, 5, 1.6).fill(PAL.paper);
          g.roundRect(room.x + 101, f - 28, 3, 3, 1).fill(PAL.paperDeep);
          break;
        }
        case 'break': {
          withOffset(g, room.x + 44, f, () => drawCoffeeMachine(g));
          withOffset(g, room.x + 148, f, () => drawCouch(g, 84));
          drawWindowFrame(g, room.x + 130, room.y + 28, 44, 30);
          withOffset(g, room.x + 100, f, () => {
            g.roundRect(-12, -16, 24, 3, 1.4).fill(PAL.wood);
            g.rect(-1.4, -13, 2.8, 13).fill(PAL.woodDeep);
            g.roundRect(-5, -19, 5, 3, 1.2).fill(PAL.sage);
          });
          drawWallClock(g, room.x + 96, room.y + 36, 8);
          break;
        }
        case 'landing': {
          withOffset(g, room.x + 68, f, () => drawBookshelf(g, 48, 78));
          drawWindowFrame(g, room.x + 262, room.y + 30, 44, 30);
          drawWallArt(g, room.x + 156, room.y + 34, 40, 30, PAL.plum);
          withOffset(g, room.x + 196, f, () => drawSideChair(g, -1));
          break;
        }
        case 'hall': {
          if (room.floor > 0) {
            drawWindowFrame(g, room.x + room.w / 2 - 16, room.y + 22, 32, 26);
          }
          break;
        }
        case 'archive': {
          if (room.w > 170) {
            withOffset(g, room.x + room.w / 2, f, () => drawBookshelf(g, Math.min(120, room.w - 60), 84));
          }
          withOffset(g, room.x + 34, f, () => drawSideChair(g, 1));
          drawWallArt(g, room.x + room.w - 54, room.y + 30, 32, 24, PAL.amber);
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

  private buildLamps(): void {
    for (const l of this.lamps) l.sprite.destroy();
    this.lamps = [];
    this.lightLayer.removeChildren();

    const add = (x: number, y: number, size: number, base: number, color: number = PAL.amberGlow) => {
      const s = makeGlow(color, size, 0);
      s.position.set(x, y);
      this.lightLayer.addChild(s);
      this.lamps.push({ sprite: s, base, seed: Math.random() * 100 });
    };

    for (const room of this.rooms) {
      // A wide, faint ceiling wash so every room has a little warmth.
      add(room.x + room.w / 2, room.y + room.h * 0.42, Math.max(room.w, 200) * 1.5, 0.16);
      if (room.kind === 'therapy') {
        add(room.x + 168, room.floorY + lampHeadY(64), 160, 0.62);
      } else if (room.kind === 'waiting') {
        add(room.x + 116, room.floorY - 44, 124, 0.44);
        add(room.x + 24, room.floorY - 56, 90, 0.2, PAL.amber);
      } else if (room.kind === 'break') {
        add(room.x + 44, room.floorY - 52, 120, 0.34);
      } else if (room.kind === 'landing') {
        add(room.x + 176, room.y + 44, 130, 0.3);
      } else if (room.kind === 'hall') {
        add(room.x + room.w / 2, room.y + 34, 100, 0.24);
      }
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
      this.plants.push({ holder, phase: Math.random() * Math.PI * 2 });
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
      p.phase += dt * 0.55;
      p.holder.rotation = Math.sin(p.phase + i) * 0.028;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Ambience
  // ───────────────────────────────────────────────────────────────────────────

  private updateAmbience(dt: number, state: GameState, calm: boolean): void {
    const raw = state.dayPhase === 'morning_brief' ? 0 : clamp01(state.minute / DAY_LENGTH_MINUTES);
    // Smooth so the day-boundary reset reads as a sunrise, not a jump cut.
    this.ambient += (raw - this.ambient) * Math.min(1, dt * (state.dayPhase === 'running' ? 3 : 1.1));
    const duskTarget = state.dayPhase === 'day_end' ? 1 : 0;
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

    // Lamps warm up through the day and hold at full through the evening.
    this.lampLevel = clamp01(0.28 + t * t * 0.85 + this.dusk * 0.4);
    const flickerOn = !calm;
    for (let i = 0; i < this.lamps.length; i++) {
      const l = this.lamps[i];
      const flicker = flickerOn ? 0.965 + Math.sin(this.time * (2.1 + (i % 5) * 0.37) + l.seed) * 0.035 : 1;
      l.sprite.alpha = l.base * this.lampLevel * flicker;
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
      wanderAt: 0,
      waveT: 0,
      leaving: false,
      cured: false,
      ttl: -1,
      alpha: 0,
      alphaTarget: 1,
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
    const activeByTherapist = new Map<string, ScheduledSession>();
    const byClient = new Map<string, ScheduledSession>();
    for (const s of state.schedule) {
      if (s.status === 'active') activeByTherapist.set(s.therapistId, s);
      if (s.status === 'active' || s.status === 'scheduled') byClient.set(s.clientId, s);
    }

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
        continue;
      }
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
        const seat = room?.seats.find((s) => s.role === 'client');
        if (seat) this.sendTo(a, seat);
      } else if (running && state.minute >= startMin - ARRIVE_LEAD) {
        seen.add(key);
        const a = this.ensureActor(key, 'client', c.id, c.portrait, this.doorPoint());
        if (a.leaving) continue;
        a.ttl = -1;
        a.alphaTarget = 1;
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
          const step = CLIMB_SPEED * dt;
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
          const step = WALK_SPEED * dt;
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
      // Feet sit on the floorboards; the chair geometry is drawn behind them.
      a.rig.view.position.set(a.x, a.y);
      setPersonPose(a.rig, mode === 'sit' ? 'sit' : 'stand', a.sleepy && mode !== 'walk');
      setPersonFacing(a.rig, a.facing);
      animatePerson(a.rig, dt, mode, reduced);
      // Upper floors draw over lower ones; within a floor, right over left.
      a.rig.view.zIndex = a.floor * 10000 + a.x;
    }
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
      w.sprite.x += w.vx * dt;
      w.sprite.y += w.vy * dt;
      w.vx += Math.sin(w.life * 5) * 4 * dt;
      const k = w.life / w.max;
      w.sprite.alpha = k * 0.35;
      const size = 10 + (1 - k) * 26;
      w.sprite.width = size;
      w.sprite.height = size;
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
      w = { sprite: s, vx: 0, vy: 0, life: 0, max: 1 };
      this.wisps.push(w);
    }
    w.sprite.position.set(x, y);
    w.sprite.visible = true;
    w.vx = (Math.random() - 0.5) * 8;
    w.vy = -16 - Math.random() * 10;
    w.max = 1.6 + Math.random() * 0.8;
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

/** Re-exported so room maths and chair geometry stay in sync. */
export { SEAT_HEIGHT };
