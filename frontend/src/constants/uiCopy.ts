/**
 * Application UI copy
 * Natural, concise, and professional copy (no AI buzzwords or fluff).
 */

export const UI_COPY = {
  empty: {
    exams: {
      student: {
        title: "No exams assigned",
        description: "You don't have any exams or classes scheduled right now.",
        primaryAction: "Refresh",
      },
      professor: {
        title: "No exams yet",
        description: "You haven't created any exams yet.",
        primaryAction: "Create exam",
      },
      general: {
        title: "No exams available",
        description: "There are currently no active exams.",
        primaryAction: "Refresh",
      },
    },
    questions: {
      title: "No questions added",
      description: "Start adding multiple-choice or coding questions to this exam.",
      primaryAction: "Add question",
    },
    submissions: {
      title: "No submissions yet",
      description: "No students have submitted this exam yet.",
      primaryAction: "Copy link",
    },
  },

  loading: {
    default: {
      title: "Loading...",
      subtext: "Please wait a moment.",
    },
    examTaking: {
      title: "Opening exam...",
      subtext: "Setting up your environment.",
    },
    examDetail: {
      title: "Loading exam details...",
      subtext: "Fetching questions and settings.",
    },
    submitting: {
      title: "Submitting...",
      subtext: "Saving your responses.",
    },
  },

  error: {
    network: {
      title: "Connection error",
      description: "Couldn't reach the server. Check your connection and try again.",
      primaryAction: "Try again",
    },
    notFound: {
      title: "Exam not found",
      description: "This exam doesn't exist or you don't have access to it.",
      primaryAction: "Go to dashboard",
    },
    generic: {
      title: "Something went wrong",
      description: "An unexpected error occurred. Please try again.",
      primaryAction: "Try again",
    },
    compiler: {
      title: "Execution timed out",
      description: "Your code took longer than 10 seconds to run. Check for infinite loops.",
      primaryAction: "Try again",
      secondaryAction: "Reset code",
    },
  },

  slowNetwork: {
    offline: "You're offline. Changes are saved locally.",
    slow: "Slow connection. Syncing changes...",
    reconnecting: "Reconnecting...",
  },

  search: {
    noResultsTitle: "No results found",
    noResultsDescription: (query: string) => `No results for "${query}".`,
    clearFilters: "Clear search",
  },

  validation: {
    required: (field: string) => `Enter ${field.toLowerCase()}.`,
    emailInvalid: "Enter a valid email address.",
    passwordTooShort: "Password must be at least 6 characters.",
    identifierRequired: "Enter your email, staff ID, or register number.",
    passwordRequired: "Enter your password.",
  },

  success: {
    examSubmitted: {
      title: "Exam submitted",
      description: "Your answers were saved and submitted.",
      primaryAction: "Back to dashboard",
    },
    saved: {
      title: "Saved",
      description: "Your changes have been saved.",
    },
  },
};
