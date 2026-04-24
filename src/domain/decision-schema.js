export const DECISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["selectedMode", "decision", "response", "guardrails", "graphAnalysis", "entryState", "memory"],
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
    graphAnalysis: {
      type: "object",
      additionalProperties: false,
      required: [
        "observedSignals",
        "candidateStates",
        "candidateCauses",
        "candidateInterventions",
        "discriminatingSignals",
        "graphTrace",
        "graphConfidence",
        "hypothesisConflicts"
      ],
      properties: {
        observedSignals: {
          type: "array",
          items: {
            type: "string"
          }
        },
        candidateStates: {
          type: "array",
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "label", "layer", "domains", "score", "supportedBy"],
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              layer: {
                type: "string",
                enum: ["strategy", "commercial", "operations", "finance", "people", "management"]
              },
              domains: {
                type: "array",
                items: { type: "string" }
              },
              score: {
                type: "number",
                minimum: 0,
                maximum: 1
              },
              supportedBy: {
                type: "array",
                items: { type: "string" }
              }
            }
          }
        },
        candidateCauses: {
          type: "array",
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "label", "layer", "domains", "score", "supportedBy"],
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              layer: {
                type: "string",
                enum: ["strategy", "commercial", "operations", "finance", "people", "management"]
              },
              domains: {
                type: "array",
                items: { type: "string" }
              },
              score: {
                type: "number",
                minimum: 0,
                maximum: 1
              },
              supportedBy: {
                type: "array",
                items: { type: "string" }
              }
            }
          }
        },
        candidateInterventions: {
          type: "array",
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "label", "layer", "domains", "score", "whyUseful"],
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              layer: {
                type: "string",
                enum: ["strategy", "commercial", "operations", "finance", "people", "management"]
              },
              domains: {
                type: "array",
                items: { type: "string" }
              },
              score: {
                type: "number",
                minimum: 0,
                maximum: 1
              },
              whyUseful: { type: "string" }
            }
          }
        },
        discriminatingSignals: {
          type: "array",
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["signal", "question", "separates", "whyUseful", "informationGain"],
            properties: {
              signal: { type: "string" },
              question: { type: "string" },
              separates: {
                type: "array",
                items: { type: "string" }
              },
              whyUseful: { type: "string" },
              informationGain: {
                type: "number",
                minimum: 0,
                maximum: 1
              }
            }
          }
        },
        graphTrace: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["fromSignal", "viaState", "toCause", "weight"],
            properties: {
              fromSignal: { type: "string" },
              viaState: { type: "string" },
              toCause: { type: "string" },
              weight: {
                type: "number",
                minimum: 0,
                maximum: 1
              }
            }
          }
        },
        graphConfidence: {
          type: "number",
          minimum: 0,
          maximum: 1
        },
        hypothesisConflicts: {
          type: "array",
          items: {
            type: "string"
          }
        }
      }
    },
    entryState: {
      type: "object",
      additionalProperties: false,
      required: [
        "entryMode",
        "claimedProblem",
        "claimedCause",
        "knownFacts",
        "symptoms",
        "observedSignals",
        "systemLayers",
        "businessLayers",
        "layerClasses",
        "flowTypes",
        "primaryFlow",
        "constraintType",
        "higherLayerCheck",
        "candidateConstraints",
        "candidateStates",
        "candidateCauses",
        "selectedConstraint",
        "graphTrace",
        "discriminatingSignals",
        "graphConfidence",
        "hypothesisConflicts",
        "signalSufficiency",
        "nextBestQuestion",
        "nextBestStep",
        "whyThisStep",
        "promotionReadiness"
      ],
      properties: {
        entryMode: {
          type: "string",
          enum: [
            "problem_first",
            "tool_discovery",
            "specific_tool_request",
            "url_only",
            "url_plus_problem",
            "unclear"
          ]
        },
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
        observedSignals: {
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
        businessLayers: {
          type: "array",
          maxItems: 11,
          items: {
            type: "string",
            enum: [
              "owner_context",
              "external_environment",
              "strategy",
              "product",
              "commercial",
              "operations",
              "finance",
              "team",
              "governance",
              "technology",
              "data_analytics"
            ]
          }
        },
        layerClasses: {
          type: "array",
          maxItems: 4,
          items: {
            type: "string",
            enum: ["A", "B", "C", "D"]
          }
        },
        flowTypes: {
          type: "array",
          maxItems: 6,
          items: {
            type: "string",
            enum: ["demand", "leads", "deals", "delivery", "cash", "decisions"]
          }
        },
        primaryFlow: {
          type: "string",
          enum: ["", "demand", "leads", "deals", "delivery", "cash", "decisions"]
        },
        constraintType: {
          type: "string",
          enum: ["", "supply", "quality", "throughput", "capacity", "control", "visibility"]
        },
        higherLayerCheck: {
          type: "object",
          additionalProperties: false,
          required: ["currentClass", "betterExplainedAbove", "highestUnrejectedClass", "whyNotHigher"],
          properties: {
            currentClass: {
              type: "string",
              enum: ["", "A", "B", "C", "D"]
            },
            betterExplainedAbove: {
              type: "boolean"
            },
            highestUnrejectedClass: {
              type: "string",
              enum: ["", "A", "B", "C", "D"]
            },
            whyNotHigher: {
              type: "string"
            }
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
        candidateStates: {
          type: "array",
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "label", "layer", "domains", "score", "supportedBy"],
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              layer: {
                type: "string",
                enum: ["strategy", "commercial", "operations", "finance", "people", "management"]
              },
              domains: {
                type: "array",
                items: { type: "string" }
              },
              score: {
                type: "number",
                minimum: 0,
                maximum: 1
              },
              supportedBy: {
                type: "array",
                items: { type: "string" }
              }
            }
          }
        },
        candidateCauses: {
          type: "array",
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "label", "layer", "domains", "score", "supportedBy"],
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              layer: {
                type: "string",
                enum: ["strategy", "commercial", "operations", "finance", "people", "management"]
              },
              domains: {
                type: "array",
                items: { type: "string" }
              },
              score: {
                type: "number",
                minimum: 0,
                maximum: 1
              },
              supportedBy: {
                type: "array",
                items: { type: "string" }
              }
            }
          }
        },
        selectedConstraint: {
          type: "string"
        },
        graphTrace: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["fromSignal", "viaState", "toCause", "weight"],
            properties: {
              fromSignal: { type: "string" },
              viaState: { type: "string" },
              toCause: { type: "string" },
              weight: {
                type: "number",
                minimum: 0,
                maximum: 1
              }
            }
          }
        },
        discriminatingSignals: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["signal", "question", "separates", "whyUseful", "informationGain"],
            properties: {
              signal: { type: "string" },
              question: { type: "string" },
              separates: {
                type: "array",
                items: { type: "string" }
              },
              whyUseful: { type: "string" },
              informationGain: {
                type: "number",
                minimum: 0,
                maximum: 1
              }
            }
          }
        },
        graphConfidence: {
          type: "number",
          minimum: 0,
          maximum: 1
        },
        hypothesisConflicts: {
          type: "array",
          items: {
            type: "string"
          }
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
