package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
	"runtime"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/santifer/career-ops/dashboard/internal/data"
	"github.com/santifer/career-ops/dashboard/internal/model"
	"github.com/santifer/career-ops/dashboard/internal/theme"
	"github.com/santifer/career-ops/dashboard/internal/ui/screens"
)

type viewState int

const (
	viewOverview viewState = iota
	viewPipeline
	viewReport
	viewProgress
	viewInbox
	viewProfile
)

type appModel struct {
	overview        screens.OverviewModel
	pipeline        screens.PipelineModel
	viewer          screens.ViewerModel
	progress        screens.ProgressModel
	inbox           screens.InboxModel
	profile         screens.ProfileModel
	state           viewState
	careerOpsPath   string
	theme           theme.Theme
	progressMetrics model.ProgressMetrics
}

func (m *appModel) reloadOverview() {
	apps := data.ParseApplications(m.careerOpsPath)
	if apps == nil {
		apps = []model.CareerApplication{}
	}
	items := data.ParsePipelineInbox(m.careerOpsPath)
	ov := data.ComputeOverview(m.careerOpsPath, apps, items)
	m.overview = screens.NewOverviewModel(m.theme, ov, m.overview.Width(), m.overview.Height())
}

func (m *appModel) reloadPipelineData() {
	apps := data.ParseApplications(m.careerOpsPath)
	metrics := data.ComputeMetrics(apps)
	m.progressMetrics = data.ComputeProgressMetrics(apps)
	m.pipeline = m.pipeline.WithReloadedData(apps, metrics)
}

func (m appModel) Init() tea.Cmd {
	return nil
}

func (m appModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.overview.Resize(msg.Width, msg.Height)
		m.pipeline.Resize(msg.Width, msg.Height)
		if m.state == viewReport {
			m.viewer.Resize(msg.Width, msg.Height)
		}
		if m.state == viewProgress {
			m.progress.Resize(msg.Width, msg.Height)
		}
		if m.state == viewInbox {
			m.inbox.Resize(msg.Width, msg.Height)
		}
		if m.state == viewProfile {
			m.profile.Resize(msg.Width, msg.Height)
		}
		pm, cmd := m.pipeline.Update(msg)
		m.pipeline = pm
		return m, cmd

	// Overview navigation
	case screens.OverviewClosedMsg:
		return m, tea.Quit
	case screens.OverviewOpenInboxMsg:
		items := data.ParsePipelineInbox(m.careerOpsPath)
		stats := data.ComputeInboxStats(items)
		m.inbox = screens.NewInboxModel(m.theme, items, stats, m.overview.Width(), m.overview.Height())
		m.state = viewInbox
		return m, nil
	case screens.OverviewOpenProfileMsg:
		m.profile = screens.NewProfileModel(m.theme, m.careerOpsPath, m.overview.Width(), m.overview.Height())
		m.state = viewProfile
		return m, nil
	case screens.OverviewOpenTrackerMsg:
		m.state = viewPipeline
		return m, nil
	case screens.OverviewOpenURLMsg:
		url := msg.URL
		return m, openURLCmd(url)

	// Profile navigation
	case screens.ProfileClosedMsg:
		m.state = viewOverview
		return m, nil

	case screens.PipelineOpenInboxMsg:
		items := data.ParsePipelineInbox(m.careerOpsPath)
		stats := data.ComputeInboxStats(items)
		m.inbox = screens.NewInboxModel(m.theme, items, stats, m.pipeline.Width(), m.pipeline.Height())
		m.state = viewInbox
		return m, nil

	case screens.InboxClosedMsg:
		// Return to whichever view we came from
		if m.state == viewInbox {
			m.state = viewOverview
		}
		return m, nil

	case screens.InboxOpenURLMsg:
		return m, openURLCmd(msg.URL)

	case screens.PipelineClosedMsg:
		// From pipeline view, go back to overview instead of quitting
		if m.state == viewPipeline {
			m.reloadOverview()
			m.state = viewOverview
			return m, nil
		}
		return m, tea.Quit

	case screens.PipelineLoadReportMsg:
		archetype, tldr, remote, comp := data.LoadReportSummary(msg.CareerOpsPath, msg.ReportPath)
		m.pipeline.EnrichReport(msg.ReportPath, archetype, tldr, remote, comp)
		return m, nil

	case screens.PipelineUpdateStatusMsg:
		err := data.UpdateApplicationStatus(msg.CareerOpsPath, msg.App, msg.NewStatus)
		if err != nil {
			// Log the error but still reload data to keep UI consistent
			fmt.Fprintf(os.Stderr, "WARN: status update failed: %v\n", err)
		}
		m.reloadPipelineData()
		return m, nil

	case screens.PipelineRefreshMsg:
		m.reloadPipelineData()
		return m, nil

	case screens.PipelineOpenReportMsg:
		m.viewer = screens.NewViewerModel(
			m.theme,
			msg.Path, msg.Title,
			m.pipeline.Width(), m.pipeline.Height(),
		)
		m.state = viewReport
		return m, nil

	case screens.ViewerClosedMsg:
		m.state = viewPipeline
		return m, nil

	case screens.PipelineOpenProgressMsg:
		m.progress = screens.NewProgressModel(
			theme.NewTheme("catppuccin-mocha"),
			m.progressMetrics,
			m.pipeline.Width(), m.pipeline.Height(),
		)
		m.state = viewProgress
		return m, nil

	case screens.ProgressClosedMsg:
		m.state = viewPipeline
		return m, nil

	case screens.PipelineOpenURLMsg:
		return m, openURLCmd(msg.URL)

	default:
		if m.state == viewOverview {
			ov, cmd := m.overview.Update(msg)
			m.overview = ov
			return m, cmd
		}
		if m.state == viewReport {
			vm, cmd := m.viewer.Update(msg)
			m.viewer = vm
			return m, cmd
		}
		if m.state == viewProgress {
			pg, cmd := m.progress.Update(msg)
			m.progress = pg
			return m, cmd
		}
		if m.state == viewInbox {
			ib, cmd := m.inbox.Update(msg)
			m.inbox = ib
			return m, cmd
		}
		if m.state == viewProfile {
			pf, cmd := m.profile.Update(msg)
			m.profile = pf
			return m, cmd
		}
		pm, cmd := m.pipeline.Update(msg)
		m.pipeline = pm
		return m, cmd
	}
}

// openURLCmd returns a tea.Cmd that opens a URL in the browser.
func openURLCmd(url string) tea.Cmd {
	return func() tea.Msg {
		var cmd *exec.Cmd
		switch runtime.GOOS {
		case "darwin":
			cmd = exec.Command("open", url)
		case "linux":
			cmd = exec.Command("xdg-open", url)
		case "windows":
			cmd = exec.Command("cmd", "/c", "start", "", url)
		default:
			cmd = exec.Command("xdg-open", url)
		}
		_ = cmd.Run()
		return nil
	}
}

func (m appModel) View() string {
	switch m.state {
	case viewOverview:
		return m.overview.View()
	case viewReport:
		return m.viewer.View()
	case viewProgress:
		return m.progress.View()
	case viewInbox:
		return m.inbox.View()
	case viewProfile:
		return m.profile.View()
	default:
		return m.pipeline.View()
	}
}

func main() {
	pathFlag := flag.String("path", ".", "Path to career-ops directory")
	flag.Parse()

	careerOpsPath := *pathFlag

	// Load applications (allow empty — overview screen handles it)
	apps := data.ParseApplications(careerOpsPath)
	if apps == nil {
		apps = []model.CareerApplication{}
	}

	// Compute everything
	metrics := data.ComputeMetrics(apps)
	progressMetrics := data.ComputeProgressMetrics(apps)
	inboxItems := data.ParsePipelineInbox(careerOpsPath)
	overviewData := data.ComputeOverview(careerOpsPath, apps, inboxItems)

	t := theme.NewTheme("auto")
	pm := screens.NewPipelineModel(t, apps, metrics, careerOpsPath, 120, 40)

	for _, app := range apps {
		if app.ReportPath == "" {
			continue
		}
		archetype, tldr, remote, comp := data.LoadReportSummary(careerOpsPath, app.ReportPath)
		if archetype != "" || tldr != "" || remote != "" || comp != "" {
			pm.EnrichReport(app.ReportPath, archetype, tldr, remote, comp)
		}
	}

	overview := screens.NewOverviewModel(t, overviewData, 120, 40)

	m := appModel{
		overview:        overview,
		pipeline:        pm,
		careerOpsPath:   careerOpsPath,
		theme:           t,
		progressMetrics: progressMetrics,
		state:           viewOverview, // start on Overview
	}

	p := tea.NewProgram(m, tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}
