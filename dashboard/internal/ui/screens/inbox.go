package screens

import (
	"fmt"
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

// InboxModel shows pending URLs from data/pipeline.md.
type InboxModel struct {
	items        []model.PipelineInboxItem
	filtered     []model.PipelineInboxItem
	cursor       int
	scrollOffset int
	filter       string // "all", "pending", "processed", or a source name
	width        int
	height       int
	theme        theme.Theme
}

// NewInboxModel creates a new inbox screen.
func NewInboxModel(t theme.Theme, items []model.PipelineInboxItem, width, height int) InboxModel {
	m := InboxModel{
		items:  items,
		width:  width,
		height: height,
		theme:  t,
		filter: "pending",
	}
	m.applyFilter()
	return m
}

// Init implements tea.Model.
func (m InboxModel) Init() tea.Cmd { return nil }

// Resize updates dimensions.
func (m *InboxModel) Resize(width, height int) {
	m.width = width
	m.height = height
}

// Width returns the current width.
func (m InboxModel) Width() int { return m.width }

// Height returns the current height.
func (m InboxModel) Height() int { return m.height }

func (m *InboxModel) applyFilter() {
	m.filtered = m.filtered[:0]
	for _, it := range m.items {
		switch m.filter {
		case "all":
			m.filtered = append(m.filtered, it)
		case "pending":
			if !it.Processed {
				m.filtered = append(m.filtered, it)
			}
		case "processed":
			if it.Processed {
				m.filtered = append(m.filtered, it)
			}
		default:
			// Source filter
			if it.Source == m.filter {
				m.filtered = append(m.filtered, it)
			}
		}
	}
	if m.cursor >= len(m.filtered) {
		m.cursor = len(m.filtered) - 1
	}
	if m.cursor < 0 {
		m.cursor = 0
	}
}

// Update handles input for the inbox screen.
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
			m.filter = "all"
			m.cursor = 0
			m.scrollOffset = 0
			m.applyFilter()
		case "2":
			m.filter = "pending"
			m.cursor = 0
			m.scrollOffset = 0
			m.applyFilter()
		case "3":
			m.filter = "processed"
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
	// Header + tabs + column headers + footer = ~6 rows overhead
	v := m.height - 6
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

// View renders the inbox.
func (m InboxModel) View() string {
	th := m.theme

	headerStyle := lipgloss.NewStyle().
		Foreground(th.Mauve).
		Bold(true).
		Padding(0, 1)

	tabStyle := lipgloss.NewStyle().Foreground(th.Subtext).Padding(0, 1)
	activeTabStyle := lipgloss.NewStyle().Foreground(th.Mauve).Bold(true).Padding(0, 1)

	rowStyle := lipgloss.NewStyle().Foreground(th.Text)
	cursorStyle := lipgloss.NewStyle().Foreground(th.Mauve).Bold(true)
	mutedStyle := lipgloss.NewStyle().Foreground(th.Subtext)
	processedStyle := lipgloss.NewStyle().Foreground(th.Subtext).Strikethrough(true)

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

	// Header
	total := len(m.items)
	pending := 0
	processed := 0
	for _, it := range m.items {
		if it.Processed {
			processed++
		} else {
			pending++
		}
	}
	title := fmt.Sprintf("Pipeline Inbox — %d pending / %d processed / %d total", pending, processed, total)
	b.WriteString(headerStyle.Render(title))
	b.WriteString("\n\n")

	// Tabs
	tabs := []struct{ key, label, filter string }{
		{"1", "All", "all"},
		{"2", "Pending", "pending"},
		{"3", "Processed", "processed"},
	}
	var tabLine strings.Builder
	for _, t := range tabs {
		label := fmt.Sprintf("[%s] %s", t.key, t.label)
		if m.filter == t.filter {
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
	companyW := 24
	roleW := 48
	if m.width < 100 {
		roleW = m.width - numW - sourceW - companyW - 6
		if roleW < 10 {
			roleW = 10
		}
	}

	// Column headers
	hdr := fmt.Sprintf("%-*s  %-*s  %-*s  %-*s",
		numW, "#",
		sourceW, "SOURCE",
		companyW, "COMPANY",
		roleW, "ROLE")
	b.WriteString(mutedStyle.Render(hdr))
	b.WriteString("\n")
	b.WriteString(mutedStyle.Render(strings.Repeat("─", numW+sourceW+companyW+roleW+6)))
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
			company := truncate(it.Company, companyW)
			role := truncate(it.Role, roleW)
			line := fmt.Sprintf("%-*d  %-*s  %-*s  %-*s",
				numW, it.Number,
				sourceW, "",
				companyW, company,
				roleW, role)
			sourceRendered := sourceColor(it.Source).Render(fmt.Sprintf("%-*s", sourceW, it.Source))
			// Rebuild with colored source
			parts := strings.SplitN(line, fmt.Sprintf("%-*s", sourceW, ""), 2)
			if len(parts) == 2 {
				line = parts[0] + sourceRendered + parts[1]
			}

			if it.Processed {
				line = processedStyle.Render(line)
			} else if i == m.cursor {
				line = cursorStyle.Render(cursor + line[2:])
			} else {
				line = rowStyle.Render(line)
			}

			if i != m.cursor {
				b.WriteString(cursor)
			}
			b.WriteString(line)
			b.WriteString("\n")
		}
	}

	// Footer
	b.WriteString("\n")
	footer := "↑/↓ navigate  1/2/3 filter  o/enter open URL  q back"
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
