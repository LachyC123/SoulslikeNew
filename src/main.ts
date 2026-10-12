import { Game } from './game';

// Expose for debugging and automated smoke tests.
(window as unknown as { game: Game }).game = new Game();
