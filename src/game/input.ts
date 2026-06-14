/** Cross-platform input: keyboard (WASD/arrow keys) + touch virtual joystick, combined into a single movement direction */
export class Input {
  private keys = new Set<string>();
  /** Touch-joystick direction (normalized, -1~1) */
  private joystick = { x: 0, z: 0 };

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.key.toLowerCase());
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  attach() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  detach() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  /** by Vue Called by the joystick component */
  setJoystick(x: number, z: number) {
    this.joystick.x = x;
    this.joystick.z = z;
  }

  /** Get the normalized movement direction (world x/z) */
  getDirection(): { x: number; z: number } {
    let x = 0;
    let z = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) z += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) z -= 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;

    /** Use the joystick when there's no keyboard input */
    if (x === 0 && z === 0) {
      x = this.joystick.x;
      z = this.joystick.z;
    }

    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    return { x, z };
  }
}
