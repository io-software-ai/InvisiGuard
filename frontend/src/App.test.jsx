import { render, screen, fireEvent } from '@testing-library/react'
import App from './App'

describe('App', () => {
  // Tab state syncs to window.location.hash; jsdom keeps that hash across tests,
  // so reset it before each so one test's tab navigation does not leak into the next.
  beforeEach(() => {
    window.location.hash = ''
  })

  it('renders the main title', () => {
    render(<App />)
    // The brand text now appears in both the header and the structured footer
    // brand block, so assert at least one exact "InvisiGuard" node renders.
    expect(screen.getAllByText('InvisiGuard').length).toBeGreaterThan(0)
  })

  it('renders the Embed tab by default', () => {
    render(<App />)
    expect(screen.getByText(/Upload Image/i)).toBeInTheDocument()
  })

  it('shows the UTF-8 byte counter instead of the removed alpha/strength slider', () => {
    render(<App />)
    expect(screen.getByText(/0 \/ 92 bytes/i)).toBeInTheDocument()
    expect(screen.queryByText(/Strength \(Alpha\)/i)).not.toBeInTheDocument()
  })

  it('exposes Dropzone as a keyboard-focusable, labeled control (WCAG 2.1.1)', () => {
    render(<App />)
    const dropzone = screen.getByRole('button', { name: 'Choose an image' })
    expect(dropzone).toHaveAttribute('tabIndex', '0')
  })

  it('keeps a single shared engine selection in sync across Embed and Verify tabs', () => {
    render(<App />)

    // Reveal & select TrustMark AI via the "social" purpose quick-pick in the Embed tab.
    // ConfigPanel is i18n'd (owned by a parallel change); default test-environment
    // language is English, so the purpose button reads "Social sharing".
    fireEvent.click(screen.getByRole('button', { name: /Social sharing/i }))
    expect(screen.getByRole('radio', { name: /TrustMark AI/ })).toHaveAttribute('aria-checked', 'true')

    // Switching to the Verify tab must reflect the same engine choice, not a separate one.
    fireEvent.click(screen.getByRole('button', { name: 'Verify (Blind)' }))
    expect(screen.getByRole('radio', { name: /TrustMark AI/ })).toHaveAttribute('aria-checked', 'true')
  })

  it('surfaces validation problems as a non-blocking toast instead of window.alert', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    render(<App />)

    // Type watermark text but leave the image unselected so client-side validation fails;
    // the button is disabled while text is empty, so text must be filled first.
    fireEvent.change(screen.getByPlaceholderText(/Copyright 2026/i), { target: { value: 'test' } })
    // "Embed Watermark" matches both the tab button and the ConfigPanel submit button;
    // the submit button is the one rendered later in the DOM.
    const embedButtons = screen.getAllByRole('button', { name: /Embed Watermark/i })
    fireEvent.click(embedButtons[embedButtons.length - 1])

    expect(alertSpy).not.toHaveBeenCalled()
    // Default test-environment language is English (navigator.language is not
    // mocked to zh), so the i18n'd toast renders its English string.
    expect(screen.getByText(/Please fix the following and try again/i)).toBeInTheDocument()
    alertSpy.mockRestore()
  })
})
