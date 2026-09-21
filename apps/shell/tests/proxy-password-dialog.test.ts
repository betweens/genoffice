/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomeApi, ProxySettings } from '../src/shared/home-api'
import { LocaleProvider } from '../src/renderer/src/locale'
import { ProxyPasswordDialog } from '../src/renderer/src/ProxyPasswordDialog'

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const SAMPLE: ProxySettings = {
  enabled: true,
  username: 'alice',
  password: '',
  host: 'webproxy.cn.vwgroup.com',
  port: 8080,
  maskedUrl: '',
  passwordEncryption: 'none',
}

let host: HTMLDivElement
let root: Root
let getProxySettings: ReturnType<typeof vi.fn>
let setProxySettings: ReturnType<typeof vi.fn>

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  getProxySettings = vi.fn(async () => SAMPLE)
  setProxySettings = vi.fn(async (next: ProxySettings) => ({
    ...SAMPLE,
    ...next,
    maskedUrl: `http://${next.username}:****@${next.host}:${next.port}`,
    passwordEncryption: 'safeStorage' as const,
  }))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

async function renderDialog(lang: 'en' | 'zh' = 'en'): Promise<ReturnType<typeof vi.fn>> {
  const onSaved = vi.fn()
  window.aiOffice = {
    getProxySettings,
    setProxySettings,
  } as unknown as HomeApi

  await act(async () => {
    root.render(
      createElement(
        LocaleProvider,
        { initial: lang },
        createElement(ProxyPasswordDialog, { onSaved }),
      ),
    )
    await Promise.resolve()
    await Promise.resolve()
  })
  return onSaved
}

const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!

async function typeInto(input: HTMLInputElement, text: string): Promise<void> {
  await act(async () => {
    setInputValue.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

describe('proxy password startup gate', () => {
  it('shows the OS username as read-only and hides the default host:port', async () => {
    await renderDialog()
    const user = host.querySelector<HTMLInputElement>('#proxy-gate-user')
    expect(user?.value).toBe('alice')
    expect(user?.readOnly).toBe(true)
    expect(user?.value).not.toBe('humingfei')
    expect(host.querySelector('[data-testid="proxy-gate-endpoint"]')).toBeNull()
    expect(host.textContent).not.toContain('webproxy.cn.vwgroup.com')
    expect(host.textContent).not.toContain('Host')
    expect(host.querySelector('#proxy-gate-pass')?.getAttribute('type')).toBe('password')
  })

  it('does not save until a password is entered, then persists through existing IPC', async () => {
    const onSaved = await renderDialog()
    const confirm = host.querySelector<HTMLButtonElement>('.btn-primary')
    expect(confirm?.disabled).toBe(true)

    await typeInto(host.querySelector<HTMLInputElement>('#proxy-gate-pass')!, 's3cret!')
    expect(confirm?.disabled).toBe(false)

    await act(async () => {
      confirm!.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(setProxySettings).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        username: 'alice',
        password: 's3cret!',
        host: 'webproxy.cn.vwgroup.com',
        port: 8080,
      }),
    )
    expect(onSaved).toHaveBeenCalledOnce()
    expect(host.textContent).not.toContain('s3cret!')
  })

  it('uses Chinese copy for the gate', async () => {
    await renderDialog('zh')
    expect(host.querySelector('#proxy-gate-title')?.textContent).toBe('企业网络代理')
    expect(host.textContent).toContain('保存并继续')
    expect(host.textContent).toContain('用户名')
    expect(host.textContent).toContain('密码')
    expect(host.textContent).not.toContain('主机')
    expect(host.textContent).not.toContain('webproxy.cn.vwgroup.com')
  })

  it('shows a generic error when save fails and never echoes the password', async () => {
    setProxySettings.mockRejectedValueOnce(new Error('boom s3cret!'))
    await renderDialog()
    await typeInto(host.querySelector<HTMLInputElement>('#proxy-gate-pass')!, 's3cret!')
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.btn-primary')!.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(host.textContent).toContain('Could not save proxy settings')
    expect(host.textContent).not.toContain('s3cret!')
  })
})
