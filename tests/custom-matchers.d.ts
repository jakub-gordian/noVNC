// Type declarations for custom bun:test matchers defined in test-helpers.ts

declare module "bun:test" {
    interface Matchers<T = unknown> {
        toHaveDisplayed(targetData: ArrayLike<number>, cmp?: (a: number, b: number) => boolean): void;
        toHaveSent(targetData: ArrayLike<number>): void;
        toEqualArray(expected: ArrayLike<number>): void;
    }
}
