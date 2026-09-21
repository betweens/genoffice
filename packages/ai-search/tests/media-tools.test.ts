import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/gsk', () => ({
  gskGenerateImage: vi.fn(),
  gskAnalyzeMedia: vi.fn(),
  hasGskAuth: vi.fn(() => true),
}))

import { generateImageTool } from '../src/media-tools'
import { gskGenerateImage } from '../src/gsk'

const gskGen = vi.mocked(gskGenerateImage)
// nonexistent settings file → defaults: media locked to custom, Genspark cloud tools off
const SETTINGS = '/nonexistent/ai-settings.json'

beforeEach(() => {
  gskGen.mockReset()
})

describe('generateImageTool (enterprise custom lock)', () => {
  it('does not fall back to Genspark when custom is unconfigured', async () => {
    const r = await generateImageTool(SETTINGS, { prompt: 'red podcast icon' })
    expect(r.error).toMatch(/Custom media provider requires a Base URL/)
    expect(gskGen).not.toHaveBeenCalled()
  })

  it('does not chain a Genspark background-removal pass', async () => {
    const r = await generateImageTool(SETTINGS, {
      prompt: 'red podcast icon',
      transparentBackground: true,
    })
    expect(r.error).toMatch(/Custom media provider requires a Base URL/)
    expect(gskGen).not.toHaveBeenCalled()
  })

  it('does not send a Genspark-only rmbg model through the gsk CLI', async () => {
    const r = await generateImageTool(SETTINGS, {
      prompt: 'remove background',
      model: 'fal-bria-rmbg',
      referenceImageUrls: ['https://cdn/x/src.png'],
      transparentBackground: true,
    })
    expect(r.error).toBeTruthy()
    expect(gskGen).not.toHaveBeenCalled()
  })
})
