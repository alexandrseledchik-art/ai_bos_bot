export const DECISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["selectedMode", "decision", "response", "guardrails", "entryState", "memory"],
  properties: {
    selectedMode: {
      type: "string",
      enum: ["clarification_mode", "diagnostic_mode", "website_screening_mode"]
    },
    decision: {
      type: "object",
      additionalProperties: false,
      required: ["action", "signalSufficiency", "confidence", "rationale"],
      properties: {
        action: {
          type: "string",
          enum: ["clarify", "screen", "diagnose", "answer"]
        },
        signalSufficiency: {
          type: "string",
          enum: ["weak", "partial", "enough"]
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1
        },
        rationale: {
          type: "string"
        }
      }
    },
    response: {
      type: "object",
      additionalProperties: false,
      required: [
        "whatIUnderstood",
        "hypotheses",
        "whyItMatters",
        "nextStep",
        "responseText"
      ],
      properties: {
        whatIUnderstood: {
          type: "string"
        },
        hypotheses: {
          type: "array",
          minItems: 1,
          maxItems: 2,
          items: {
            type: "string"
          }
        },
        whyItMatters: {
          type: "string"
        },
        nextStep: {
          type: "string"
        },
        responseText: {
          type: "string"
        }
      }
    },
    guardrails: {
      type: "object",
      additionalProperties: false,
      required: [
        "knownFacts",
        "observations",
        "workingHypotheses",
        "canNotAssert",
        "confidenceNote"
      ],
      properties: {
        knownFacts: {
          type: "array",
          items: {
            type: "string"
          }
        },
        observations: {
          type: "array",
          items: {
            type: "string"
          }
        },
        workingHypotheses: {
          type: "array",
          items: {
            type: "string"
          }
        },
        canNotAssert: {
          type: "array",
          items: {
            type: "string"
          }
        },
        confidenceNote: {
          type: "string"
        }
      }
    },
    entryState: {
      type: "object",
      additionalProperties: false,
      required: [
        "claimedProblem",
        "claimedCause",
        "knownFacts",
        "symptoms",
        "systemLayers",
        "candidateConstraints",
        "selectedConstraint",
        "signalSufficiency",
        "nextBestQuestion",
        "nextBestStep",
        "whyThisStep",
        "promotionReadiness"
      ],
      properties: {
        claimedProblem: {
          type: "string"
        },
        claimedCause: {
          type: "string"
        },
        knownFacts: {
          type: "array",
          items: {
            type: "string"
          }
        },
        symptoms: {
          type: "array",
          items: {
            type: "string"
          }
        },
        systemLayers: {
          type: "array",
          maxItems: 6,
          items: {
            type: "string",
            enum: ["strategy", "commercial", "operations", "finance", "people", "management"]
          }
        },
        candidateConstraints: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "layer", "confidence", "whyPossible", "whatWouldDisprove"],
            properties: {
              label: {
                type: "string"
              },
              layer: {
                type: "string",
                enum: ["strategy", "commercial", "operations", "finance", "people", "management"]
              },
              confidence: {
                type: "number",
                minimum: 0,
                maximum: 1
              },
              whyPossible: {
                type: "string"
              },
              whatWouldDisprove: {
                type: "string"
              }
            }
          }
        },
        selectedConstraint: {
          type: "string"
        },
        signalSufficiency: {
          type: "string",
          enum: ["weak", "partial", "enough"]
        },
        nextBestQuestion: {
          type: "string"
        },
        nextBestStep: {
          type: "string"
        },
        whyThisStep: {
          type: "string"
        },
        promotionReadiness: {
          type: "string",
          enum: ["keep_in_entry", "ready_for_diagnostic_case", "ready_for_screening_case", "promoted"]
        }
      }
    },
    memory: {
      type: "object",
      additionalProperties: false,
      required: [
        "companyName",
        "caseKind",
        "goal",
        "symptoms",
        "hypotheses",
        "constraint",
        "situation",
        "actionWave",
        "toolRecommendations",
        "artifact"
      ],
      properties: {
        companyName: {
          type: "string"
        },
        caseKind: {
          type: "string",
          enum: ["preliminary_screening", "diagnostic_case"]
        },
        goal: {
          type: "string"
        },
        symptoms: {
          type: "array",
          items: {
            type: "string"
          }
        },
        hypotheses: {
          type: "array",
          items: {
            type: "string"
          }
        },
        constraint: {
          type: "string"
        },
        situation: {
          type: "string"
        },
        actionWave: {
          type: "object",
          additionalProperties: false,
          required: ["enabled", "firstStep", "notNow", "whyThisFirst"],
          properties: {
            enabled: {
              type: "boolean"
            },
            firstStep: {
              type: "string"
            },
            notNow: {
              type: "string"
            },
            whyThisFirst: {
              type: "string"
            }
          }
        },
        toolRecommendations: {
          type: "array",
          maxItems: 3,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "reason", "usageMoment"],
            properties: {
              name: {
                type: "string"
              },
              reason: {
                type: "string"
              },
              usageMoment: {
                type: "string"
              }
            }
          }
        },
        artifact: {
          type: "object",
          additionalProperties: false,
          required: ["shouldSave", "title", "summary", "kind"],
          properties: {
            shouldSave: {
              type: "boolean"
            },
            title: {
              type: "string"
            },
            summary: {
              type: "string"
            },
            kind: {
              type: "string",
              enum: ["screening", "diagnosis", "action_wave", "snapshot"]
            }
          }
        }
      }
    }
  }
};
