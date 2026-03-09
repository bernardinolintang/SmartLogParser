import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Factory, Cpu, Box, BookOpen, Layers, Hash, ChevronDown, ChevronRight, Filter } from 'lucide-react';
import type { ParsedEvent } from '@/lib/logParser';

interface HierarchyFilter {
  tool_id?: string;
  chamber_id?: string;
  recipe_name?: string;
  recipe_step?: string;
  run_id?: string;
}

interface EquipmentHierarchyProps {
  events: ParsedEvent[];
  filter: HierarchyFilter;
  onFilterChange: (filter: HierarchyFilter) => void;
}

export default function EquipmentHierarchy({ events, filter, onFilterChange }: EquipmentHierarchyProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const hierarchy = useMemo(() => {
    const fabs: Record<string, Record<string, Record<string, Record<string, Set<string>>>>> = {};
    events.forEach(e => {
      if (!fabs[e.fab_id]) fabs[e.fab_id] = {};
      if (!fabs[e.fab_id][e.tool_id]) fabs[e.fab_id][e.tool_id] = {};
      if (!fabs[e.fab_id][e.tool_id][e.chamber_id]) fabs[e.fab_id][e.tool_id][e.chamber_id] = {};
      if (!fabs[e.fab_id][e.tool_id][e.chamber_id][e.recipe_name]) fabs[e.fab_id][e.tool_id][e.chamber_id][e.recipe_name] = new Set();
      if (e.recipe_step) fabs[e.fab_id][e.tool_id][e.chamber_id][e.recipe_name].add(e.recipe_step);
    });
    return fabs;
  }, [events]);

  const toggle = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const isActive = (f: HierarchyFilter) => {
    return filter.tool_id === f.tool_id && filter.chamber_id === f.chamber_id && filter.recipe_name === f.recipe_name && filter.recipe_step === f.recipe_step;
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-2 py-1.5 mb-2">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Equipment Tree</span>
        {(filter.tool_id || filter.chamber_id || filter.recipe_name || filter.recipe_step) && (
          <button onClick={() => onFilterChange({})} className="text-[10px] text-primary hover:underline">
            Clear
          </button>
        )}
      </div>

      {Object.entries(hierarchy).map(([fabId, tools]) => (
        <div key={fabId}>
          <button
            onClick={() => toggle(fabId)}
            className="flex items-center gap-1.5 w-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded transition-colors"
          >
            {expanded[fabId] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <Factory className="w-3 h-3 text-primary" />
            <span className="font-medium">{fabId}</span>
          </button>

          {expanded[fabId] && Object.entries(tools).map(([toolId, chambers]) => {
            const toolKey = `${fabId}/${toolId}`;
            const toolActive = filter.tool_id === toolId && !filter.chamber_id;
            return (
              <div key={toolId} className="ml-3">
                <button
                  onClick={() => toggle(toolKey)}
                  className="flex items-center gap-1.5 w-full px-2 py-1 text-xs rounded transition-colors group"
                >
                  {expanded[toolKey] ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                  <Cpu className="w-3 h-3 text-info" />
                  <span className={`font-mono ${toolActive ? 'text-primary font-semibold' : 'text-foreground'}`}>{toolId}</span>
                  <Filter
                    className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto"
                    onClick={(ev) => { ev.stopPropagation(); onFilterChange({ tool_id: toolId }); }}
                  />
                </button>

                {expanded[toolKey] && Object.entries(chambers).map(([chId, recipes]) => {
                  const chKey = `${toolKey}/${chId}`;
                  const chActive = filter.tool_id === toolId && filter.chamber_id === chId && !filter.recipe_name;
                  return (
                    <div key={chId} className="ml-4">
                      <button
                        onClick={() => toggle(chKey)}
                        className="flex items-center gap-1.5 w-full px-2 py-1 text-xs rounded transition-colors group"
                      >
                        {expanded[chKey] ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                        <Box className="w-3 h-3 text-warning" />
                        <span className={`font-mono ${chActive ? 'text-primary font-semibold' : 'text-foreground'}`}>{chId}</span>
                        <Filter
                          className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto"
                          onClick={(ev) => { ev.stopPropagation(); onFilterChange({ tool_id: toolId, chamber_id: chId }); }}
                        />
                      </button>

                      {expanded[chKey] && Object.entries(recipes).map(([recipe, steps]) => {
                        const recKey = `${chKey}/${recipe}`;
                        return (
                          <div key={recipe} className="ml-4">
                            <button
                              onClick={() => toggle(recKey)}
                              className="flex items-center gap-1.5 w-full px-2 py-1 text-xs rounded transition-colors group"
                            >
                              {expanded[recKey] ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                              <BookOpen className="w-3 h-3 text-success" />
                              <span className={`font-mono text-[11px] truncate ${filter.recipe_name === recipe ? 'text-primary font-semibold' : 'text-foreground'}`}>{recipe || '(unnamed)'}</span>
                              <Filter
                                className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto flex-shrink-0"
                                onClick={(ev) => { ev.stopPropagation(); onFilterChange({ tool_id: toolId, chamber_id: chId, recipe_name: recipe }); }}
                              />
                            </button>

                            {expanded[recKey] && [...steps].map(step => (
                              <button
                                key={step}
                                onClick={() => onFilterChange({ tool_id: toolId, chamber_id: chId, recipe_name: recipe, recipe_step: step })}
                                className={`flex items-center gap-1.5 ml-4 px-2 py-1 text-[11px] rounded transition-colors w-full ${
                                  filter.recipe_step === step && filter.recipe_name === recipe ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                <Layers className="w-3 h-3" />
                                <span className="truncate">{step}</span>
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}

      {Object.keys(hierarchy).length === 0 && (
        <p className="text-xs text-muted-foreground px-2 py-4 text-center">No equipment data</p>
      )}
    </div>
  );
}

export type { HierarchyFilter };
