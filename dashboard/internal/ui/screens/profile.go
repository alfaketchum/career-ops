package screens

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/santifer/career-ops/dashboard/internal/theme"
)

// ProfileClosedMsg is emitted when the profile viewer is dismissed.
type ProfileClosedMsg struct{}

// profileTab is one of the user-data files the screen can display.
type profileTab struct {
	key   string
	label string
	path  string // relative to careerOpsPath
}

// ProfileModel shows the user's profile, CV, and article-digest files
// so the user can see what the evaluator is filtering against.
type ProfileModel struct {
	careerOpsPath string
	tabs          []profileTab
	active        int
	content       []string // cached file contents per tab (lazy-loaded)
	scrollOffset  int
	width         int
	height        int
	theme         theme.Theme
}

func NewProfileModel(t theme.Theme, careerOpsPath string, width, height int) ProfileModel {
	tabs := []profileTab{
		{"1", "Profile", "modes/_profile.md"},
		{"2", "CV", "cv.md"},
		{"3", "Proof Points", "article-digest.md"},
		{"4", "Config", "config/profile.yml"},
		{"5", "Portals", "portals.yml"},
	}
	m := ProfileModel{
		careerOpsPath: careerOpsPath,
		tabs:          tabs,
		content:       make([]string, len(tabs)),
		width:         width,
		height:        height,
		theme:         t,
	}
	m.loadActive()
	return m
}

func (m ProfileModel) Init() tea.Cmd { return nil }

func (m *ProfileModel) Resize(width, height int) {
	m.width = width
	m.height = height
}

func (m *ProfileModel) loadActive() {
	if m.content[m.active] != "" {
		return // already loaded
	}
	path := filepath.Join(m.careerOpsPath, m.tabs[m.active].path)
	bytes, err := os.ReadFile(path)
	if err != nil {
		m.content[m.active] = fmt.Sprintf("(file not found: %s)\n\n%s", m.tabs[m.active].path, err.Error())
		return
	}
	m.content[m.active] = string(bytes)
}

func (m ProfileModel) Update(msg tea.Msg) (ProfileModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "esc":
			return m, func() tea.Msg { return ProfileClosedMsg{} }
		case "down", "j":
			m.scrollOffset++
		case "up", "k":
			if m.scrollOffset > 0 {
				m.scrollOffset--
			}
		case "pgdown", "ctrl+d":
			m.scrollOffset += m.height / 2
		case "pgup", "ctrl+u":
			m.scrollOffset -= m.height / 2
			if m.scrollOffset < 0 {
				m.scrollOffset = 0
			}
		case "g":
			m.scrollOffset = 0
		case "G":
			lines := strings.Split(m.content[m.active], "\n")
			m.scrollOffset = len(lines) - m.visibleRows()
			if m.scrollOffset < 0 {
				m.scrollOffset = 0
			}
		case "1", "2", "3", "4", "5":
			idx := int(msg.String()[0] - '1')
			if idx >= 0 && idx < len(m.tabs) {
				m.active = idx
				m.scrollOffset = 0
				m.loadActive()
			}
		case "tab", "right", "l":
			m.active = (m.active + 1) % len(m.tabs)
			m.scrollOffset = 0
			m.loadActive()
		case "shift+tab", "left", "h":
			m.active = (m.active - 1 + len(m.tabs)) % len(m.tabs)
			m.scrollOffset = 0
			m.loadActive()
		}
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
	}
	return m, nil
}

func (m *ProfileModel) visibleRows() int {
	v := m.height - 6 // header + tabs + footer
	if v < 1 {
		return 1
	}
	return v
}

func (m ProfileModel) View() string {
	th := m.theme
	headerStyle := lipgloss.NewStyle().Foreground(th.Mauve).Bold(true).Padding(0, 1)
	tabStyle := lipgloss.NewStyle().Foreground(th.Subtext).Padding(0, 1)
	activeTabStyle := lipgloss.NewStyle().Foreground(th.Mauve).Bold(true).Padding(0, 1).
		Underline(true)
	dim := lipgloss.NewStyle().Foreground(th.Subtext)
	textStyle := lipgloss.NewStyle().Foreground(th.Text)

	var b strings.Builder

	// Header
	b.WriteString(headerStyle.Render("Profile — what the evaluator filters against"))
	b.WriteString("\n")
	b.WriteString(dim.Render(fmt.Sprintf("File: %s", m.tabs[m.active].path)))
	b.WriteString("\n\n")

	// Tabs
	var tabLine strings.Builder
	for _, t := range m.tabs {
		label := fmt.Sprintf("[%s] %s", t.key, t.label)
		if m.tabs[m.active].key == t.key {
			tabLine.WriteString(activeTabStyle.Render(label))
		} else {
			tabLine.WriteString(tabStyle.Render(label))
		}
	}
	b.WriteString(tabLine.String())
	b.WriteString("\n\n")

	// Body — render lines with simple markdown emphasis
	lines := strings.Split(m.content[m.active], "\n")
	visible := m.visibleRows()
	end := m.scrollOffset + visible
	if end > len(lines) {
		end = len(lines)
	}
	if m.scrollOffset > len(lines) {
		m.scrollOffset = 0
	}
	for i := m.scrollOffset; i < end; i++ {
		line := lines[i]
		// Light styling: headings purple, list bullets accented
		switch {
		case strings.HasPrefix(line, "# "):
			b.WriteString(lipgloss.NewStyle().Foreground(th.Mauve).Bold(true).Render(line))
		case strings.HasPrefix(line, "## "):
			b.WriteString(lipgloss.NewStyle().Foreground(th.Pink).Bold(true).Render(line))
		case strings.HasPrefix(line, "### "):
			b.WriteString(lipgloss.NewStyle().Foreground(th.Sky).Bold(true).Render(line))
		case strings.HasPrefix(strings.TrimSpace(line), "- ") || strings.HasPrefix(strings.TrimSpace(line), "* "):
			b.WriteString(lipgloss.NewStyle().Foreground(th.Yellow).Render(line))
		case strings.HasPrefix(line, "|"):
			b.WriteString(lipgloss.NewStyle().Foreground(th.Sky).Render(line))
		default:
			b.WriteString(textStyle.Render(line))
		}
		b.WriteString("\n")
	}

	// Footer
	b.WriteString("\n")
	b.WriteString(dim.Render(
		fmt.Sprintf("Line %d-%d of %d   •   ↑/↓ scroll  ←/→ or 1-5 tabs  q back",
			m.scrollOffset+1, end, len(lines)),
	))
	return b.String()
}
