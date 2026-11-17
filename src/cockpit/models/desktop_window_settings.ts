import { InvalidWindowSettingsError } from "@/cockpit/models/errors";
import { ensure } from "@/core/models/invariant";

const MINIMUM_WIDTH = 800;
const MINIMUM_HEIGHT = 600;

export interface DesktopWindowSettingsDTO {
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly rendererDevUrl: string | null;
}

export class DesktopWindowSettings {
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly rendererDevUrl: string | null;

  private constructor(settings: DesktopWindowSettingsDTO) {
    this.title = settings.title;
    this.width = settings.width;
    this.height = settings.height;
    this.rendererDevUrl = settings.rendererDevUrl;
  }

  static create(settings: DesktopWindowSettingsDTO): DesktopWindowSettings {
    ensure(
      settings.width >= MINIMUM_WIDTH && settings.height >= MINIMUM_HEIGHT,
      () =>
        new InvalidWindowSettingsError(
          `Window must be at least ${String(MINIMUM_WIDTH)}x${String(MINIMUM_HEIGHT)}: ${String(settings.width)}x${String(settings.height)}`,
        ),
    );
    return new DesktopWindowSettings(settings);
  }

  usesDevServer(): boolean {
    return this.rendererDevUrl !== null;
  }
}
