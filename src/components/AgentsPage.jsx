import { useState, useMemo, useEffect } from 'react';
import { 
  AGENTS, 
  AGENT_SPECIALTIES, 
  searchAgents, 
  getCategoriesWithCounts,
  getAllSkills,
  getEnabledAgentsInSelector,
  toggleAgentInSelector,
  enableAllAgentsInSelector,
  disableAllAgentsInSelector,
  getEnabledAgentCount
} from '../lib/agentRegistry';
import './AgentsPage.css';

// Icon component mapping for Lucide-style icons
const AgentIcon = ({ name, className = "" }) => {
  const icons = {
    'code-2': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>
      </svg>
    ),
    'layout': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
      </svg>
    ),
    'server': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/>
        <line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>
      </svg>
    ),
    'cloud-cog': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="m8 17 4 4 4-4"/><path d="M12 13V3"/><path d="M20 17.607c1.165-.85 2-2.265 2-3.607a4.5 4.5 0 0 0-4.5-4.5 6.16 6.16 0 0 0-2.1.354 5.98 5.98 0 0 0-8.038-1.048A5.504 5.504 0 0 0 2 12.5C2 15.022 3.73 17.12 6.13 17.5"/>
      </svg>
    ),
    'smartphone': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>
      </svg>
    ),
    'bar-chart-3': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>
      </svg>
    ),
    'brain-circuit': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
        <path d="M9 13h6"/><path d="M9 17h3"/><path d="M9 9h6"/>
      </svg>
    ),
    'database': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/>
        <path d="M3 12A9 3 0 0 0 21 12"/>
      </svg>
    ),
    'shield-check': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>
      </svg>
    ),
    'check-circle-2': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
      </svg>
    ),
    'building-2': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M10 12h4"/><path d="M10 8h4"/><path d="M14 21v-3a2 2 0 0 0-4 0v3"/>
        <path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/>
      </svg>
    ),
    'palette': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
        <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
      </svg>
    ),
    'pen-tool': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="m12 19 7-7 3 3-7 7-3-3z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
        <path d="m2 2 7.586 7.586"/><circle cx="11" cy="11" r="2"/>
      </svg>
    ),
    'megaphone': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
      </svg>
    ),
    'file-text': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/>
      </svg>
    ),
    'briefcase': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
      </svg>
    ),
    'target': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
      </svg>
    ),
    'search': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ),
    'graduation-cap': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
      </svg>
    ),
    'headphones': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M3 14v3a2 2 0 0 0 2 2h2a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H5a2 2 0 0 0-2 2z"/><path d="M21 14v3a2 2 0 0 1-2 2h-2a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h2a2 2 0 0 1 2 2z"/>
        <path d="M21 14a9 9 0 0 0-9-9 9 9 0 0 0-9 9"/>
      </svg>
    ),
    'trending-up': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
      </svg>
    ),
    'scale': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
        <path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>
      </svg>
    ),
    'dollar-sign': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
    'heart-pulse': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
        <path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>
      </svg>
    ),
    'zap': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
    'hammer': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9"/><path d="m18 15 4-4-4-4"/><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"/>
      </svg>
    ),
    'car': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
        <circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>
      </svg>
    ),
    'settings-2': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>
      </svg>
    ),
    'lightbulb': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>
      </svg>
    ),
    'book-open': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
      </svg>
    ),
    'image': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
      </svg>
    ),
    'users': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    'bot': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>
      </svg>
    ),
    'sparkles': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
        <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
      </svg>
    )
  };

  return icons[name] || icons['bot'];
};

// Category colors
const categoryColors = {
  [AGENT_SPECIALTIES.CODING]: '#3b82f6',
  [AGENT_SPECIALTIES.WRITING]: '#8b5cf6',
  [AGENT_SPECIALTIES.BUSINESS]: '#10b981',
  [AGENT_SPECIALTIES.CREATIVE]: '#f59e0b',
  [AGENT_SPECIALTIES.TECHNICAL]: '#06b6d4',
  [AGENT_SPECIALTIES.SUPPORT]: '#ec4899',
  [AGENT_SPECIALTIES.SPECIALIZED]: '#6366f1'
};

const categoryLabels = {
  [AGENT_SPECIALTIES.CODING]: 'Development',
  [AGENT_SPECIALTIES.WRITING]: 'Writing',
  [AGENT_SPECIALTIES.BUSINESS]: 'Business',
  [AGENT_SPECIALTIES.CREATIVE]: 'Creative',
  [AGENT_SPECIALTIES.TECHNICAL]: 'Technical',
  [AGENT_SPECIALTIES.SUPPORT]: 'Support',
  [AGENT_SPECIALTIES.SPECIALIZED]: 'Specialized'
};

export default function AgentsPage({ 
  isOpen, 
  onClose, 
  onSelectAgent, 
  currentAgentId,
  showToast 
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [sortBy, setSortBy] = useState('name'); // 'name', 'category'
  
  // Track which agents are enabled for the model selector
  const [enabledAgentIds, setEnabledAgentIds] = useState(() => getEnabledAgentsInSelector());

  // Get filtered and sorted agents
  const filteredAgents = useMemo(() => {
    let agents = AGENTS;
    
    // Filter by search
    if (searchQuery.trim()) {
      agents = searchAgents(searchQuery);
    }
    
    // Filter by category
    if (selectedCategory !== 'all') {
      agents = agents.filter(a => a.category === selectedCategory);
    }
    
    // Sort
    agents = [...agents].sort((a, b) => {
      if (sortBy === 'name') {
        return a.displayName.localeCompare(b.displayName);
      }
      if (sortBy === 'category') {
        return a.category.localeCompare(b.category) || a.displayName.localeCompare(b.displayName);
      }
      return 0;
    });
    
    return agents;
  }, [searchQuery, selectedCategory, sortBy]);

  const categories = useMemo(() => getCategoriesWithCounts(), []);
  const allSkills = useMemo(() => getAllSkills(), []);
  const enabledCount = useMemo(() => enabledAgentIds.length, [enabledAgentIds]);
  
  const handleToggleAgent = (agentId, e) => {
    e?.stopPropagation();
    const newEnabledState = toggleAgentInSelector(agentId);
    setEnabledAgentIds(getEnabledAgentsInSelector());
    
    const agent = AGENTS.find(a => a.id === agentId);
    if (newEnabledState) {
      showToast?.(`${agent?.displayName} enabled in model selector`);
    } else {
      showToast?.(`${agent?.displayName} hidden from model selector`);
    }
  };
  
  const handleEnableAll = () => {
    enableAllAgentsInSelector();
    setEnabledAgentIds(getEnabledAgentsInSelector());
    showToast?.('All agents enabled in model selector');
  };

  const handleDisableAll = () => {
    disableAllAgentsInSelector();
    setEnabledAgentIds(getEnabledAgentsInSelector());
    showToast?.('All agents disabled in model selector');
  };

  const handleSelectAgent = (agent) => {
    onSelectAgent(agent);
    showToast?.(`Switched to ${agent.displayName}`);
    onClose();
  };

  const handleUseAgent = () => {
    if (selectedAgent) {
      handleSelectAgent(selectedAgent);
      setSelectedAgent(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`agents-page ${isOpen ? 'slide-in' : 'slide-out'}`}>
      {/* Header */}
      <div className="agents-page-header">
        <div className="agents-header-inner">
          <div className="agents-topbar">
            <button className="agents-back-btn" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
              </svg>
              Back
            </button>
            
            <div className="agents-title-section">
              <h1>AI Agents</h1>
              <p className="agents-subtitle">
                {enabledCount} of {AGENTS.length} visible in model selector
              </p>
            </div>

            <div className="agents-header-actions">
              {/* Enable All button */}
              {enabledCount < AGENTS.length && (
                <button 
                  className="agents-enable-all-btn"
                  onClick={handleEnableAll}
                  title="Enable all agents in model selector"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v20M2 12h20"/>
                  </svg>
                  Enable All
                </button>
              )}

              {/* Disable All button */}
              {enabledCount > 0 && (
                <button 
                  className="agents-disable-all-btn"
                  onClick={handleDisableAll}
                  title="Disable all agents in model selector"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12"/>
                  </svg>
                  Disable All
                </button>
              )}
              
              {/* Sort dropdown */}
              <select 
                className="agents-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="name">Sort by Name</option>
                <option value="category">Sort by Category</option>
              </select>
            </div>
          </div>

          {/* Search and Filter */}
          <div className="agents-filters">
            <div className="agents-search-wrap">
              <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                placeholder="Search agents by name, specialty, or skill..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="clear-search" onClick={() => setSearchQuery('')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>

            {/* Category filters */}
            <div className="agents-category-filters">
              <button
                className={`category-filter ${selectedCategory === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('all')}
              >
                <span className="category-dot" style={{ background: '#888' }} />
                All Agents
                <span className="category-count">{AGENTS.length}</span>
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  className={`category-filter ${selectedCategory === cat.id ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat.id)}
                >
                  <span 
                    className="category-dot" 
                    style={{ background: categoryColors[cat.id] || '#888' }} 
                  />
                  {categoryLabels[cat.id] || cat.displayName}
                  <span className="category-count">{cat.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="agents-page-content">
        {filteredAgents.length === 0 ? (
          <div className="agents-empty">
            <div className="agents-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <h3>No agents found</h3>
            <p>Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="agents-grid">
            {filteredAgents.map(agent => (
              <div
                key={agent.id}
                className={`agent-card ${currentAgentId === agent.id ? 'active' : ''}`}
                onClick={() => setSelectedAgent(agent)}
              >
                <div 
                  className="agent-card-accent"
                  style={{ background: categoryColors[agent.category] }}
                />
                <div className="agent-card-header">
                  <div 
                    className="agent-avatar"
                    style={{ 
                      background: `${categoryColors[agent.category]}20`,
                      color: categoryColors[agent.category]
                    }}
                  >
                    <AgentIcon name={agent.avatar} />
                  </div>
                  <div className="agent-category-badge" style={{ 
                    background: `${categoryColors[agent.category]}20`,
                    color: categoryColors[agent.category]
                  }}>
                    {categoryLabels[agent.category]}
                  </div>
                </div>
                
                <div className="agent-card-content">
                  <h3 className="agent-name">{agent.displayName}</h3>
                  <p className="agent-specialty">{agent.specialty}</p>
                  <p className="agent-description">{agent.description}</p>
                  
                  <div className="agent-skills">
                    {agent.skills.slice(0, 3).map(skill => (
                      <span key={skill} className="agent-skill-tag">
                        {skill}
                      </span>
                    ))}
                    {agent.skills.length > 3 && (
                      <span className="agent-skill-more">+{agent.skills.length - 3}</span>
                    )}
                  </div>
                </div>

                <div className="agent-card-footer">
                  {currentAgentId === agent.id && (
                    <div className="agent-active-badge" title="Active">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      <span>Active</span>
                    </div>
                  )}
                  <div className="agent-card-actions">
                    <span className="agent-toggle-text">
                      {enabledAgentIds.includes(agent.id) ? 'On' : 'Off'}
                    </span>
                    {/* Toggle for model selector visibility */}
                    <label 
                      className="agent-toggle-label"
                      onClick={(e) => e.stopPropagation()}
                      title="Show in model selector"
                    >
                      <input
                        type="checkbox"
                        checked={enabledAgentIds.includes(agent.id)}
                        onChange={(e) => handleToggleAgent(agent.id, e)}
                      />
                      <span className="agent-toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agent Detail Modal */}
      {selectedAgent && (
        <div className="agent-detail-overlay" onClick={() => setSelectedAgent(null)}>
          <div className="agent-detail-modal" onClick={(e) => e.stopPropagation()}>
            <button className="agent-detail-close" onClick={() => setSelectedAgent(null)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>

            <div className="agent-detail-header">
              <div 
                className="agent-detail-avatar"
                style={{ 
                  background: `${categoryColors[selectedAgent.category]}20`,
                  color: categoryColors[selectedAgent.category]
                }}
              >
                <AgentIcon name={selectedAgent.avatar} />
              </div>
              <div className="agent-detail-title">
                <h2>{selectedAgent.displayName}</h2>
                <span 
                  className="agent-detail-category"
                  style={{ color: categoryColors[selectedAgent.category] }}
                >
                  {categoryLabels[selectedAgent.category]}
                </span>
              </div>
            </div>

            <div className="agent-detail-content">
              <div className="agent-detail-section">
                <h4>Specialty</h4>
                <p>{selectedAgent.specialty}</p>
              </div>

              <div className="agent-detail-section">
                <h4>About</h4>
                <p>{selectedAgent.description}</p>
              </div>

              <div className="agent-detail-section">
                <h4>Skills</h4>
                <div className="agent-detail-skills">
                  {selectedAgent.skills.map(skill => (
                    <span key={skill} className="agent-skill-tag">{skill}</span>
                  ))}
                </div>
              </div>

              <div className="agent-detail-section">
                <h4>Model Configuration</h4>
                <div className="agent-model-config">
                  <div className="model-config-item">
                    <span className="config-label">Model</span>
                    <span className="config-value">{selectedAgent.defaultModel}</span>
                  </div>
                  <div className="model-config-item">
                    <span className="config-label">Temperature</span>
                    <span className="config-value">{selectedAgent.temperature}</span>
                  </div>
                  <div className="model-config-item">
                    <span className="config-label">Top P</span>
                    <span className="config-value">{selectedAgent.top_p}</span>
                  </div>
                </div>
                <p className="model-rationale">
                  <strong>Why this model:</strong> {selectedAgent.modelRationale}
                </p>
              </div>

              <div className="agent-detail-section">
                <h4 
                  className="prompt-toggle"
                  onClick={() => setShowPromptPreview(!showPromptPreview)}
                >
                  System Prompt Preview
                  <svg 
                    className={`chevron ${showPromptPreview ? 'expanded' : ''}`}
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2"
                  >
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </h4>
                {showPromptPreview && (
                  <pre className="prompt-preview">{selectedAgent.systemPrompt}</pre>
                )}
              </div>
              
              {/* Model Selector Visibility Toggle */}
              <div className="agent-detail-section agent-visibility-section">
                <h4>Model Selector Visibility</h4>
                <div className="agent-visibility-toggle">
                  <div className="visibility-info">
                    <p className="visibility-description">
                      When enabled, this agent appears in the chat model selector dropdown for quick access.
                    </p>
                  </div>
                  <label className="agent-toggle-label large">
                    <input
                      type="checkbox"
                      checked={enabledAgentIds.includes(selectedAgent.id)}
                      onChange={(e) => handleToggleAgent(selectedAgent.id, e)}
                    />
                    <span className="agent-toggle-slider"></span>
                    <span className="toggle-text">
                      {enabledAgentIds.includes(selectedAgent.id) ? 'Visible in selector' : 'Hidden from selector'}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="agent-detail-footer">
              <button 
                className="agent-use-btn"
                onClick={handleUseAgent}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                Use This Agent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
