import test from 'node:test'
import assert from 'node:assert/strict'

import { CREDIT_UNITS, normalizeCreditUnits, selectRenderCredits, selectSummarizeCredits } from '../src/payments/credits.js'

test('selectRenderCredits returns configured render units', () => {
  assert.equal(selectRenderCredits(false), CREDIT_UNITS.renderLive)
  assert.equal(selectRenderCredits(true), CREDIT_UNITS.renderCached)
})

test('selectSummarizeCredits returns configured summary units', () => {
  assert.equal(selectSummarizeCredits(false), CREDIT_UNITS.summarizeLive)
  assert.equal(selectSummarizeCredits(true), CREDIT_UNITS.summarizeCached)
})

test('normalizeCreditUnits clamps invalid values and normalizes precision', () => {
  assert.equal(normalizeCreditUnits(undefined), 1)
  assert.equal(normalizeCreditUnits(-1), 1)
  assert.equal(normalizeCreditUnits('abc'), 1)
  assert.equal(normalizeCreditUnits(1.23456), 1.235)
  assert.equal(normalizeCreditUnits(0, 0), 0)
})
