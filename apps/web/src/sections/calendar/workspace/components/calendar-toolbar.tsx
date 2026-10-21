import { useState } from "react";
import type { CalendarPreferences } from "@zilobase/features/calendar";
import { CalendarCommands } from "./calendar-commands";
import { CalendarTravel } from "../../preferences/components/calendar-travel";
import { useCalendarWorkspace } from "./calendar-workspace";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchIcon, SidebarSimpleIcon, SettingsIcon, PlusIcon } from "@/components/icons";

/** Workspace actions compose inside the shared ReUI navigation row. */
export function CalendarToolbar({
  preferences,
  onSettings,
  onPreferences,
}: {
  preferences: CalendarPreferences;
  onSettings: () => void;
  onPreferences?: (preferences: CalendarPreferences) => Promise<unknown>;
}) {
  const workspace = useCalendarWorkspace();
  const [searchOpen, setSearchOpen] = useState(false);
  const create = workspace.featureCommands.find((command) => command.id === "create");
  const input = (
    <Input
      aria-label="Search calendar"
      placeholder="Search events"
      value={workspace.query}
      onChange={(event) => workspace.setQuery(event.target.value)}
    />
  );
  return (
    <ButtonGroup aria-label="Calendar controls" className="min-w-0 items-center" variant="plain">
      <div className="hidden w-40 xl:block">{input}</div>
      <Popover open={searchOpen} onOpenChange={setSearchOpen}>
        <PopoverTrigger asChild>
          <Button className="xl:hidden" variant="ghost" size="icon-sm" aria-label="Search events">
            <SearchIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-2">
          {input}
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="icon-sm"
        data-calendar-panel-toggle
        aria-label="Calendar event panel"
        aria-expanded={workspace.panelOpen}
        onClick={() => (workspace.panelOpen ? workspace.closePanel() : workspace.openPanel())}
      >
        <SidebarSimpleIcon />
      </Button>
      <CalendarCommands
        preferences={preferences}
        onPreferences={onPreferences}
        onSettings={onSettings}
        onSearch={() => {
          const input = [
            ...document.querySelectorAll<HTMLInputElement>('[aria-label="Search calendar"]'),
          ].find((input) => input.offsetParent !== null);
          if (input) input.focus();
          else setSearchOpen(true);
        }}
      />
      <CalendarTravel preferences={preferences} onSave={onPreferences} />
      <Button variant="ghost" size="icon-sm" aria-label="Calendar settings" onClick={onSettings}>
        <SettingsIcon />
      </Button>
      <Button size="sm" disabled={!create || create.disabled} onClick={() => create?.run()}>
        <PlusIcon />
        <span className="hidden sm:inline">Create event</span>
      </Button>
    </ButtonGroup>
  );
}
