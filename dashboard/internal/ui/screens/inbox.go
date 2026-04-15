package screens

import (
	"fmt"
	"sort"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/santifer/career-ops/dashboard/internal/model"
	"github.com/santifer/career-ops/dashboard/internal/theme"
)

// InboxClosedMsg is emitted when the inbox screen is dismissed.
type InboxClosedMsg struct{}

// InboxOpenURLMsg is emitted when a URL should be opened in the browser.
type InboxOpenURLMsg struct {
	URL string
}

// InboxFilter controls which items are shown.
type InboxFilter int

const (
	FilterAll InboxFilter = iota
	FilterUntouched
	FilterLightOnly
	FilterDeepDone
)

func (f InboxFilter) Label() string {
	switch f {
	case FilterAll:
		return "All"
	case FilterUntouched:
		return "Untouched"
	case FilterLightOnly:
		return "Light-passed"
	case FilterDeepDone:
		return "Deep-done"
	}
	return "?"
}

// InboxModel shows the full processing queue with light/deep pass state.
type InboxModel struct {
	items        []model.PipelineInboxItem
	filtered     []model.PipelineInboxItem
	stats        model.PipelineInboxStats
	cursor       int
	scrollOffset int
	filter       InboxFilter
	width        int
	height       int
	theme        theme.Theme
}

// NewInboxModel creates a new inbox screen.
func NewInboxModel(t theme.Theme, items []model.PipelineInboxItem, stats model.PipelineInboxStats, width, height int) InboxModel {
	m := InboxModel{
		items:  items,
		stats:  stats,
		width:  width,
		height: height,
		theme:  t,
		filter: FilterAll,
	}
	m.applyFilter()
	return m
}

func (m InboxModel) Init() tea.Cmd { return nil }

func (m *InboxModel) Resize(width, height int) {
	m.width = width
	m.height = height
}

func (m InboxModel) Width() int  { return m.width }
func (m InboxModel) Height() int { return m.height }

func (m *InboxModel) applyFilter() {
	m.filtered = m.filtered[:0]
	for _, it := range m.items {
		hasLight := it.LightScore > 0
		hasDeep := it.DeepReport != ""
		keep := false
		switch m.filter {
		case FilterAll:
			keep = true
		case FilterUntouched:
			keep = !hasLight && !hasDeep
		case FilterLightOnly:
			keep = hasLight && !hasDeep
		case FilterDeepDone:
			keep = hasDeep
		}
		if keep {
			m.filtered = append(m.filtered, it)
		}
	}
	// Sort: deep-done first by deep score, then light-passed by light score, then untouched at bottom
	sort.SliceStable(m.filtered, func(i, j int) bool {
		a, b := m.filtered[i], m.filtered[j]
		aKey := sortKey(a)
		bKey := sortKey(b)
		return aKey > bKey
	})
	if m.cursor >= len(m.filtered) {
		m.cursor = len(m.filtered) - 1
	}
	if m.cursor < 0 {
		m.cursor = 0
	}
}

// sortKey produces a numeric key for sorting: deep-done items score highest,
// then light-passed items by light score, then untouched at the bottom.
func sortKey(it model.PipelineInboxItem) float64 {
	if it.DeepReport != "" {
		// Rank deep-done above light-passed by a large offset, tie-break by deep score
		return 100.0 + it.DeepScore
	}
	if it.LightScore > 0 {
		return it.LightScore
	}
	return 0.0
}

func (m InboxModel) Update(msg tea.Msg) (InboxModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "esc":
			return m, func() tea.Msg { return InboxClosedMsg{} }

		case "down", "j":
			if m.cursor < len(m.filtered)-1 {
				m.cursor++
				m.adjustScroll()
			}

		case "up", "k":
			if m.cursor > 0 {
				m.cursor--
				m.adjustScroll()
			}

		case "pgdown", "ctrl+d":
			m.cursor += m.visibleRows() / 2
			if m.cursor >= len(m.filtered) {
				m.cursor = len(m.filtered) - 1
			}
			if m.cursor < 0 {
				m.cursor = 0
			}
			m.adjustScroll()

		case "pgup", "ctrl+u":
			m.cursor -= m.visibleRows() / 2
			if m.cursor < 0 {
				m.cursor = 0
			}
			m.adjustScroll()

		case "g":
			m.cursor = 0
			m.scrollOffset = 0

		case "G":
			if len(m.filtered) > 0 {
				m.cursor = len(m.filtered) - 1
				m.adjustScroll()
			}

		case "o", "enter":
			if len(m.filtered) > 0 && m.cursor < len(m.filtered) {
				url := m.filtered[m.cursor].URL
				return m, func() tea.Msg { return InboxOpenURLMsg{URL: url} }
			}

		case "1":
			m.filter = FilterAll
			m.cursor = 0
			m.scrollOffset = 0
			m.applyFilter()
		case "2":
			m.filter = FilterUntouched
			m.cursor = 0
			m.scrollOffset = 0
			m.applyFilter()
		case "3":
			m.filter = FilterLightOnly
			m.cursor = 0
			m.scrollOffset = 0
			m.applyFilter()
		case "4":
			m.filter = FilterDeepDone
			m.cursor = 0
			m.scrollOffset = 0
			m.applyFilter()
		}
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
	}
	return m, nil
}

func (m *InboxModel) visibleRows() int {
	// Header (2) + stats (1) + tabs (1) + col hdr (2) + footer (2) = ~8 overhead
	v := m.height - 8
	if v < 1 {
		return 1
	}
	return v
}

func (m *InboxModel) adjustScroll() {
	visible := m.visibleRows()
	if m.cursor < m.scrollOffset {
		m.scrollOffset = m.cursor
	}
	if m.cursor >= m.scrollOffset+visible {
		m.scrollOffset = m.cursor - visible + 1
	}
	if m.scrollOffset < 0 {
		m.scrollOffset = 0
	}
}

func (m InboxModel) View() string {
	th := m.theme

	headerStyle := lipgloss.NewStyle().Foreground(th.Mauve).Bold(true).Padding(0, 1)
	statsStyle := lipgloss.NewStyle().Foreground(th.Subtext).Padding(0, 1)
	tabStyle := lipgloss.NewStyle().Foreground(th.Subtext).Padding(0, 1)
	activeTabStyle := lipgloss.NewStyle().Foreground(th.Mauve).Bold(true).Padding(0, 1)
	rowStyle := lipgloss.NewStyle().Foreground(th.Text)
	mutedStyle := lipgloss.NewStyle().Foreground(th.Subtext)
	cursorStyle := lipgloss.NewStyle().Foreground(th.Mauve).Bold(true)

	scoreColor := func(score float64) lipgloss.Style {
		switch {
		case score >= 4.0:
			return lipgloss.NewStyle().Foreground(th.Green).Bold(true)
		case score >= 3.0:
			return lipgloss.NewStyle().Foreground(th.Yellow)
		case score > 0:
			return lipgloss.NewStyle().Foreground(th.Peach)
		default:
			return lipgloss.NewStyle().Foreground(th.Subtext)
		}
	}

	sourceColor := func(src string) lipgloss.Style {
		switch src {
		case "greenhouse", "lever", "ashby":
			return lipgloss.NewStyle().Foreground(th.Green)
		case "linkedin", "glassdoor", "indeed":
			return lipgloss.NewStyle().Foreground(th.Yellow)
		default:
			return lipgloss.NewStyle().Foreground(th.Subtext)
		}
	}

	var b strings.Builder

	// Title + stats line
	b.WriteString(headerStyle.Render("Pipeline Inbox — Always Be Applying"))
	b.WriteString("\n")
	stats := fmt.Sprintf(
		"Total: %d  •  Untouched: %d  •  Light-only: %d  •  Deep-done: %d",
		m.stats.Total, m.stats.Untouched, m.stats.LightOnly, m.stats.DeepDone,
	)
	b.WriteString(statsStyle.Render(stats))
	b.WriteString("\n")

	// Tabs
	tabs := []struct {
		key string
		f   InboxFilter
	}{
		{"1", FilterAll},
		{"2", FilterUntouched},
		{"3", FilterLightOnly},
		{"4", FilterDeepDone},
	}
	var tabLine strings.Builder
	for _, t := range tabs {
		label := fmt.Sprintf("[%s] %s", t.key, t.f.Label())
		if m.filter == t.f {
			tabLine.WriteString(activeTabStyle.Render(label))
		} else {
			tabLine.WriteString(tabStyle.Render(label))
		}
	}
	b.WriteString(tabLine.String())
	b.WriteString("\n")

	// Column widths
	numW := 4
	sourceW := 11
	lightW := 7
	deepW := 14 // shows "042 (4.5/5)" or "—"
	companyW := 22
	roleW := m.width - numW - sourceW - lightW - deepW - companyW - 10
	if roleW < 12 {
		roleW = 12
	}

	// Column header
	hdr := fmt.Sprintf("%-*s  %-*s  %-*s  %-*s  %-*s  %-*s",
		numW, "#",
		sourceW, "SOURCE",
		lightW, "LIGHT",
		deepW, "DEEP",
		companyW, "COMPANY",
		roleW, "ROLE")
	b.WriteString(mutedStyle.Render(hdr))
	b.WriteString("\n")
	b.WriteString(mutedStyle.Render(strings.Repeat("─", numW+sourceW+lightW+deepW+companyW+roleW+10)))
	b.WriteString("\n")

	// Rows
	if len(m.filtered) == 0 {
		b.WriteString(mutedStyle.Render("  (no items match this filter)"))
		b.WriteString("\n")
	} else {
		visible := m.visibleRows()
		end := m.scrollOffset + visible
		if end > len(m.filtered) {
			end = len(m.filtered)
		}
		for i := m.scrollOffset; i < end; i++ {
			it := m.filtered[i]
			cursor := "  "
			if i == m.cursor {
				cursor = "▸ "
			}

			lightStr := "—"
			if it.LightScore > 0 {
				lightStr = fmt.Sprintf("%.1f", it.LightScore)
			}
			deepStr := "—"
			if it.DeepReport != "" {
				deepStr = fmt.Sprintf("%s (%.1f)", it.DeepReport, it.DeepScore)
			}

			company := truncate(it.Company, companyW)
			role := truncate(it.Role, roleW)

			// Assemble row with colored components
			numCol := fmt.Sprintf("%-*d", numW, it.Number)
			srcCol := sourceColor(it.Source).Render(fmt.Sprintf("%-*s", sourceW, it.Source))
			lightCol := scoreColor(it.LightScore).Render(fmt.Sprintf("%-*s", lightW, lightStr))
			var deepCol string
			if it.DeepReport != "" {
				deepCol = scoreColor(it.DeepScore).Bold(true).Render(fmt.Sprintf("%-*s", deepW, deepStr))
			} else {
				deepCol = mutedStyle.Render(fmt.Sprintf("%-*s", deepW, deepStr))
			}
			companyCol := fmt.Sprintf("%-*s", companyW, company)
			roleCol := fmt.Sprintf("%-*s", roleW, role)

			line := fmt.Sprintf("%s%s  %s  %s  %s  %s  %s", cursor, numCol, srcCol, lightCol, deepCol, companyCol, roleCol)

			if i == m.cursor {
				b.WriteString(cursorStyle.Render(line))
			} else {
				b.WriteString(rowStyle.Render(line))
			}
			b.WriteString("\n")
		}
	}

	// Footer
	b.WriteString("\n")
	footer := "↑/↓ navigate  1/2/3/4 filter  o/enter open URL  q back"
	b.WriteString(mutedStyle.Render(footer))

	return b.String()
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	if max < 4 {
		return s[:max]
	}
	return s[:max-1] + "…"
}
