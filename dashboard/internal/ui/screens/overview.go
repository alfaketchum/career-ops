package screens

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/santifer/career-ops/dashboard/internal/model"
	"github.com/santifer/career-ops/dashboard/internal/theme"
)

// OverviewClosedMsg is emitted when the overview screen is dismissed.
type OverviewClosedMsg struct{}

// OverviewOpenURLMsg opens a URL in the browser.
type OverviewOpenURLMsg struct{ URL string }

// OverviewOpenInboxMsg jumps to the inbox view.
type OverviewOpenInboxMsg struct{}

// OverviewOpenProfileMsg jumps to the profile viewer.
type OverviewOpenProfileMsg struct{}

// OverviewModel renders a top-level "state of your job search" dashboard.
type OverviewModel struct {
	overview     model.Overview
	width        int
	height       int
	scrollOffset int
	cursor       int // selected top-priority row
	theme        theme.Theme
}

func NewOverviewModel(t theme.Theme, ov model.Overview, width, height int) OverviewModel {
	return OverviewModel{overview: ov, width: width, height: height, theme: t}
}

func (m OverviewModel) Init() tea.Cmd { return nil }

func (m *OverviewModel) Resize(width, height int) {
	m.width = width
	m.height = height
}

func (m OverviewModel) Width() int  { return m.width }
func (m OverviewModel) Height() int { return m.height }

func (m OverviewModel) Update(msg tea.Msg) (OverviewModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "esc":
			return m, func() tea.Msg { return OverviewClosedMsg{} }
		case "i":
			return m, func() tea.Msg { return OverviewOpenInboxMsg{} }
		case "P":
			return m, func() tea.Msg { return OverviewOpenProfileMsg{} }
		case "down", "j":
			if m.cursor < len(m.overview.TopPriorities)-1 {
				m.cursor++
			}
		case "up", "k":
			if m.cursor > 0 {
				m.cursor--
			}
		case "o", "enter":
			if m.cursor < len(m.overview.TopPriorities) {
				url := m.overview.TopPriorities[m.cursor].URL
				return m, func() tea.Msg { return OverviewOpenURLMsg{URL: url} }
			}
		case "pgdown", "ctrl+d":
			m.scrollOffset += 5
		case "pgup", "ctrl+u":
			m.scrollOffset -= 5
			if m.scrollOffset < 0 {
				m.scrollOffset = 0
			}
		}
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
	}
	return m, nil
}

// ── Helpers ────────────────────────────────────────────────────────

func bar(value, max, width int, fill, empty string, fillStyle lipgloss.Style) string {
	if max <= 0 || width <= 0 {
		return strings.Repeat(empty, width)
	}
	filled := value * width / max
	if filled > width {
		filled = width
	}
	if filled < 0 {
		filled = 0
	}
	return fillStyle.Render(strings.Repeat(fill, filled)) + strings.Repeat(empty, width-filled)
}

func (m OverviewModel) section(title, body string, accent lipgloss.Color, w int) string {
	titleStyle := lipgloss.NewStyle().Foreground(accent).Bold(true)
	innerW := w - 4
	if innerW < 10 {
		innerW = 10
	}
	border := lipgloss.NewStyle().
		Foreground(m.theme.Subtext).
		Border(lipgloss.RoundedBorder()).
		Padding(0, 1).
		Width(innerW)
	header := titleStyle.Render(title)
	return border.Render(header + "\n" + body)
}

func (m OverviewModel) View() string {
	th := m.theme
	headerStyle := lipgloss.NewStyle().Foreground(th.Mauve).Bold(true).Padding(0, 1)
	dim := lipgloss.NewStyle().Foreground(th.Subtext)
	bold := lipgloss.NewStyle().Foreground(th.Text).Bold(true)
	good := lipgloss.NewStyle().Foreground(th.Green).Bold(true)
	warn := lipgloss.NewStyle().Foreground(th.Yellow).Bold(true)
	cursorStyle := lipgloss.NewStyle().Foreground(th.Mauve).Bold(true)

	var b strings.Builder

	// Title
	b.WriteString(headerStyle.Render("career-ops — Overview (Always Be Applying)"))
	b.WriteString("\n\n")

	// ── FUNNEL ────────────────────────────────────────────────
	ov := m.overview
	maxVal := ov.Scan.TotalSeen
	if maxVal == 0 {
		maxVal = 1
	}
	barW := 30
	funnel := []struct {
		label string
		val   int
		color lipgloss.Style
	}{
		{"Scanner    ", ov.Scan.TotalSeen, lipgloss.NewStyle().Foreground(th.Blue)},
		{"Inbox      ", ov.InboxPending, lipgloss.NewStyle().Foreground(th.Sky)},
		{"Light pass ", ov.Light.Done, lipgloss.NewStyle().Foreground(th.Yellow)},
		{"Deep pass  ", ov.Deep.Done, lipgloss.NewStyle().Foreground(th.Peach)},
		{"Applied    ", ov.Tracker.ByStatus["applied"], lipgloss.NewStyle().Foreground(th.Green)},
	}
	var funnelLines []string
	for _, f := range funnel {
		barLine := bar(f.val, maxVal, barW, "█", "░", f.color)
		funnelLines = append(funnelLines, fmt.Sprintf("%s  %s  %s", dim.Render(f.label), barLine, bold.Render(fmt.Sprintf("%d", f.val))))
	}
	b.WriteString(m.section("PIPELINE FUNNEL", strings.Join(funnelLines, "\n"), th.Mauve, m.width))
	b.WriteString("\n")

	// ── SCANNER ──────────────────────────────────────────────
	scanLines := []string{
		fmt.Sprintf("Total URLs seen:    %s", bold.Render(fmt.Sprintf("%d", ov.Scan.TotalSeen))),
		fmt.Sprintf("Added to inbox:     %s", good.Render(fmt.Sprintf("%d", ov.Scan.Added))),
		fmt.Sprintf("Filtered by title:  %s", dim.Render(fmt.Sprintf("%d", ov.Scan.SkippedTitle))),
		fmt.Sprintf("Duplicates skipped: %s", dim.Render(fmt.Sprintf("%d", ov.Scan.SkippedDup))),
		fmt.Sprintf("Expired/dead links: %s", dim.Render(fmt.Sprintf("%d", ov.Scan.SkippedExpired))),
		fmt.Sprintf("Last scan:          %s", bold.Render(orDash(ov.Scan.LastScanDate))),
	}
	b.WriteString(m.section("SCANNER", strings.Join(scanLines, "\n"), th.Blue, m.width))
	b.WriteString("\n")

	// ── LIGHT PASS ───────────────────────────────────────────
	lightLines := []string{
		fmt.Sprintf("Completed:    %s of %d", bold.Render(fmt.Sprintf("%d", ov.Light.Done)), ov.InboxTotal),
		fmt.Sprintf("Avg score:    %s", scoreOrDash(ov.Light.AvgScore)),
		fmt.Sprintf("Top score:    %s", scoreOrDash(ov.Light.HighScore)),
		fmt.Sprintf("Last scored:  %s", bold.Render(orDash(ov.Light.LastScored))),
		"",
		dim.Render("▸ Run: bash batch/batch-runner.sh --screen --parallel 5"),
	}
	b.WriteString(m.section("LIGHT PASS (Haiku)", strings.Join(lightLines, "\n"), th.Yellow, m.width))
	b.WriteString("\n")

	// ── DEEP PASS ────────────────────────────────────────────
	deepLines := []string{
		fmt.Sprintf("Completed:    %s   Pending light-passed: %s",
			bold.Render(fmt.Sprintf("%d", ov.Deep.Done)),
			warn.Render(fmt.Sprintf("%d", ov.Deep.Pending)),
		),
		fmt.Sprintf("Avg score:    %s", scoreOrDash(ov.Deep.AvgScore)),
		fmt.Sprintf("Top score:    %s", scoreOrDash(ov.Deep.HighScore)),
		fmt.Sprintf("Last deep:    %s", bold.Render(orDash(ov.Deep.LastDeepAt))),
		"",
		dim.Render("▸ Run: bash batch/batch-runner.sh --parallel 3 --limit 10"),
	}
	b.WriteString(m.section("DEEP PASS (Sonnet)", strings.Join(deepLines, "\n"), th.Peach, m.width))
	b.WriteString("\n")

	// ── APPLICATIONS ─────────────────────────────────────────
	appLines := []string{
		fmt.Sprintf("Tracker rows:  %s   Avg score: %s   Top: %s",
			bold.Render(fmt.Sprintf("%d", ov.Tracker.Total)),
			scoreOrDash(ov.Tracker.AvgScore),
			scoreOrDash(ov.Tracker.TopScore),
		),
		fmt.Sprintf("Evaluated: %d   Applied: %d   Interview: %d   Offer: %d   Rejected: %d",
			ov.Tracker.ByStatus["evaluated"],
			ov.Tracker.ByStatus["applied"],
			ov.Tracker.ByStatus["interview"],
			ov.Tracker.ByStatus["offer"],
			ov.Tracker.ByStatus["rejected"],
		),
	}
	b.WriteString(m.section("APPLICATIONS", strings.Join(appLines, "\n"), th.Green, m.width))
	b.WriteString("\n")

	// ── TOP PRIORITIES ───────────────────────────────────────
	if len(ov.TopPriorities) > 0 {
		var rows []string
		rows = append(rows, dim.Render("(URLs scored by light pass, awaiting deep eval)"))
		for i, p := range ov.TopPriorities {
			cursor := "  "
			if i == m.cursor {
				cursor = "▸ "
			}
			label := p.Company
			if p.Role != "" {
				label = label + " — " + p.Role
			}
			line := fmt.Sprintf("%s[%.1f]  %s", cursor, p.Score, label)
			if i == m.cursor {
				rows = append(rows, cursorStyle.Render(line))
			} else {
				rows = append(rows, line)
			}
		}
		b.WriteString(m.section("TOP PRIORITIES (next deep pass)", strings.Join(rows, "\n"), th.Pink, m.width))
		b.WriteString("\n")
	} else if ov.Light.Done == 0 {
		empty := dim.Render("Run the light pass to surface top priorities here.")
		b.WriteString(m.section("TOP PRIORITIES", empty, th.Pink, m.width))
		b.WriteString("\n")
	}

	// Footer
	b.WriteString(dim.Render("↑/↓ select  o open URL  i Inbox  P Profile  q Quit"))
	return b.String()
}

func orDash(s string) string {
	if s == "" {
		return "—"
	}
	return s
}

func scoreOrDash(score float64) string {
	if score <= 0 {
		return "—"
	}
	return fmt.Sprintf("%.2f / 5", score)
}
