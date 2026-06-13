import { flow, operation } from '@pathline/core';

/**
 * A tiny, non-Nest example: guess a secret number using a bounded search loop.
 * Demonstrates stages, a repeat() loop with stopWhen, branch control signals,
 * and an output resolver - all in plain Node.
 */
export interface GuessContext {
  secret: number;
  low: number;
  high: number;
  guess?: number;
  attempts: number;
  found: boolean;
}

export type GuessOutput = { found: boolean; guess?: number; attempts: number };

const makeGuess = operation<GuessContext>('Make a guess')
  .reads('low', 'high')
  .writes('guess', 'attempts')
  .handler((ctx) => {
    ctx.guess = Math.floor((ctx.low + ctx.high) / 2);
    ctx.attempts++;
  });

const narrowLow = operation<GuessContext>('Narrow upward')
  .reads('guess')
  .writes('low')
  .handler((ctx) => ({
    low: ctx.guess! + 1,
  }));

const narrowHigh = operation<GuessContext>('Narrow downward')
  .reads('guess')
  .writes('high')
  .handler((ctx) => ({
    high: ctx.guess! - 1,
  }));

const markFound = operation<GuessContext>('Mark found')
  .writes('found')
  .handler(() => ({
    found: true,
  }));

export const guessNumberFlow = flow<GuessContext, GuessOutput>('Guess the number')
  .version('1.0.0')
  .metadata({ owner: 'examples', criticality: 'low' })
  .stage('Search')
  .repeat('Binary search', (r) =>
    r
      .maxAttempts(50)
      .stopWhen('number found', (ctx) => ctx.found)
      .do(makeGuess)
      .branch('Compare', (b) =>
        b
          .when('correct', (ctx) => ctx.guess === ctx.secret)
          .do(markFound)
          .when('too low', (ctx) => ctx.guess! < ctx.secret)
          .do(narrowLow)
          .otherwise()
          .do(narrowHigh),
      ),
  )
  .output((ctx) => ({
    found: ctx.found,
    guess: ctx.guess,
    attempts: ctx.attempts,
  }));
