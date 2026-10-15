import {
  SparklesIcon,
  FilePenLineIcon,
  StarIcon,
  CalendarDaysIcon,
  LockIcon,
  HistoryIcon,
  UsersIcon,
  Layers3Icon,
  Trash2Icon,
} from "@/components/icons";
import type { LibraryView } from "@zilobase/features/user-settings";

export const libraryViewIcons = {
  skills: SparklesIcon,
  instructions: FilePenLineIcon,
  favourites: StarIcon,
  meetings: CalendarDaysIcon,
  private: LockIcon,
  recents: HistoryIcon,
  shared: UsersIcon,
  teamspaces: Layers3Icon,
  trash: Trash2Icon,
} satisfies Record<LibraryView, typeof HistoryIcon>;
