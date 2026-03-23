export interface HelperSpec {
  name: string;
  description: string;
}

export interface ResourceSpec {
  name: string;
  description: string;
  actions: string[];
}

export interface ServiceSpec {
  name: "lms" | "msi" | "ucheck" | "library";
  description: string;
  resources: ResourceSpec[];
  helpers: HelperSpec[];
}

export const SERVICES: ServiceSpec[] = [
  {
    name: "lms",
    description: "Courses, notices, materials, assignments, and online learning",
    resources: [
      {
        name: "courses",
        description: "List and inspect LMS courses",
        actions: ["list", "get"]
      },
      {
        name: "notices",
        description: "List and inspect course notices",
        actions: ["list", "get"]
      },
      {
        name: "materials",
        description: "List and inspect course materials",
        actions: ["list", "get"]
      },
      {
        name: "assignments",
        description: "List, inspect, and submit assignments",
        actions: ["list", "get", "check-submission", "submit", "delete-submission"]
      },
      {
        name: "online",
        description: "List and inspect online learning weeks",
        actions: ["list", "get"]
      },
      {
        name: "attachments",
        description: "Download LMS attachments",
        actions: ["download", "download-bulk"]
      }
    ],
    helpers: [
      { name: "+digest", description: "Show a combined course digest" },
      { name: "+action-items", description: "Show pending LMS action items" },
      { name: "+due-assignments", description: "Show due assignments" },
      { name: "+unsubmitted", description: "Show unsubmitted assignments" },
      { name: "+unread-notices", description: "Show unread notices" },
      { name: "+incomplete-online", description: "Show incomplete online weeks" }
    ]
  },
  {
    name: "msi",
    description: "Timetable, grades, and graduation requirements",
    resources: [
      {
        name: "timetable",
        description: "Read current timetable",
        actions: ["get"]
      },
      {
        name: "grades",
        description: "Read grades and history",
        actions: ["current", "history"]
      },
      {
        name: "graduation",
        description: "Read graduation requirement status",
        actions: ["requirements"]
      }
    ],
    helpers: []
  },
  {
    name: "ucheck",
    description: "Attendance by course",
    resources: [
      {
        name: "attendance",
        description: "Read attendance status by course",
        actions: ["get"]
      }
    ],
    helpers: []
  },
  {
    name: "library",
    description: "Study rooms, reading rooms, and seat reservations",
    resources: [
      {
        name: "study-rooms",
        description: "List, inspect, and reserve study rooms",
        actions: ["list", "get", "reserve", "update-reservation", "cancel-reservation"]
      },
      {
        name: "reading-rooms",
        description: "List and inspect reading rooms",
        actions: ["list", "get"]
      },
      {
        name: "seats",
        description: "List, reserve, and cancel seats",
        actions: ["list-reservations", "reserve", "cancel"]
      }
    ],
    helpers: [
      { name: "+my-reservations", description: "Show current library reservations" },
      { name: "+seat-position", description: "Explain seat position in a reading room" }
    ]
  }
];
