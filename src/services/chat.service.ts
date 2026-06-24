import Anthropic from '@anthropic-ai/sdk';
import { getContactInsight, saveContactInsight } from './insights.service';
import { createGetContactInsightTool, GetContactInsightParams } from './tools/get_contact_insight';
import {
  createSaveContactInsightTool,
  SaveContactInsightParams,
} from './tools/save_contact_insight';
import { lookupContactByPhone } from './tools/lookupContactByPhone';
import { searchContactByName } from './tools/searchContactByName';
import { searchByTag } from './tools/searchByTag';
import { searchByInsight } from './tools/searchByInsight';
import { searchSecondDegree } from './tools/searchSecondDegree';
import { getContactCount } from './tools/getContactCount';
import { searchContactsByCountry } from './tools/searchContactsByCountry';
import { webSearch } from './tools/webSearch';
import { getEnabledToolKeys } from './enabledTools.service';
import { getUserProfile, setUserProfileField } from './userProfile.service';
import { requestIntroduction, DisambiguationCandidate } from './tools/requestIntroduction';
import { respondToIntroduction } from './tools/respondToIntroduction';
import {
  getPendingRequestsForMediator,
  getRecentResponsesForRequester,
  PendingRequest,
  RespondedRequest,
} from './introduction.service';
import {
  getThread,
  getOrCreateDefaultThread,
  getThreadContext,
  touchThread,
} from './threads.service';
import { submitContactFact, getVisibleFacts } from './contactFacts.service';
import { query } from '../db/postgres/client';
import anthropic from '../config/anthropic';
import { ChatToolDefinition } from '../types';

const HISTORY_LIMIT = 50;
const MAX_TOKENS = 2048;
const MODEL = 'claude-sonnet-4-6';
const USER_PROFILE_PRIORITY_FIELDS = ['profession', 'city', 'industry'] as const;

const AGENT_STRATEGY_PROMPT = `

## შენი მთავარი მისია
შენი ერთადერთი მიზანია **მომხმარებელს სამიზნე ადამიანთან დააკავშირო**. ინფორმაციის გაზიარება მეორეხარისხოვანია — მთავარია კავშირი. „ვერ ვიპოვე" **უკიდურესი პასუხია** და მხოლოდ მაშინ შეიძლება, როდესაც ყველა ინსტრუმენტი ამოიწურა.

---

### 1. ჯერ გაარკვიე მიზანი — შემდეგ ეძებე
სანამ ძებნას დაიწყებ, **ყოველთვის** გაარკვიე:
- **რატომ** ეძებს ამ ადამიანს? (გაცნობა / შეხვედრა / საქმიანი საქმე / ინფო)
- **რა იცის** სამიზნეზე? (სახელი, კომპანია, სფერო, ქალაქი, საერთო კონტაქტი)

ეს ორი კითხვა განსაზღვრავს ძებნის სიღრმეს და სტრატეგიას. კონტექსტიდან გასაგებია? — ნუ ეკითხები. გაურკვეველია? — ერთი კითხვით გაარკვიე.

---

### 2. ძიების სტრატეგია — სრული pipeline

**ფაზა A — პირდაპირი ძებნა კონტაქტებში:**
1. search_by_tag — სახელის ნაწილი, სფერო, კომპანია, ქალაქი
2. search_contact_by_name — სახელით
3. search_by_insight — შენახულ ინფოში

**ფაზა B — Web Enrichment (თუ A ვერ ამოიცნო ან ინფო არასრულია):**
4. web_search — სახელი + კომპანია/სფერო → გაარკვიე სრული სახელი, employer, city
5. **სავალდებულო re-search:** ვებ-ის შემდეგ **ხელახლა** ჩაატარე A ფაზა ახალი მონაცემებით:
   - ვებმა გამოიღო სრული სახელი? → search_contact_by_name (სრული სახელით)
   - ვებმა გამოიღო კომპანია? → search_by_tag (კომპანიის სახელით)

**ფაზა C — 2nd Degree (თუ A+B პირდაპირ ვერ იპოვა):**
6. search_second_degree — ვებ-ის შემდეგ გამდიდრებული მონაცემებით (სახელი, კომპანია)
7. თუ 2nd degree-ში ნაპოვნია → **დაუყოვნებლად შეგვიდი Introduction Path-ში**

**„ვერ ვიპოვე" — მხოლოდ A + B (re-search) + C ყველა ✗ შემდეგ.**

---

### 3. Connection Mindset — ყოველთვის კავშირზე ფიქრობ
კონტაქტი ნაპოვნია? — **პირველი კითხვა:** „როგორ შევაკავშირო?"
- პირდაპირი კონტაქტია? → გთავაზობ Ally-ით გაგზავნას (request_introduction)
- 2nd degree-ია? → ნათლად მიუთითე შუამავალი და შეგვიდი Introduction Path-ში
- მხოლოდ ვებ-შია? → ეძებე 2nd degree-ში ვებ-ის სახელით

---

### 4. Verification — ვებ + კონტაქტი ნუ გააიგივებ დაუდასტურებლად
თუ DB-ში კონტაქტი ნაპოვნია და ვებ ძებნაც ჩაატარე:
- შეადარე: employer, city, jobPosition, tags — ემთხვევა?
- თუ ემთხვევა → გაიგივება შეიძლება, ასე მიუთითე
- თუ ვერ ადასტურებ → მომხმარებელს ეკითხე: „კონტაქტში [X] ვიცი, ვებში [Y] ვნახე — ეს ერთი ადამიანია?"
- ვებ ინფო **მხოლოდ** დადასტურების შემდეგ წარადგინე როგორც ამ კონტაქტის ინფო

---

### 5. Smart Gap Detection — ხარვეზები შეავსე
თუ კონტაქტის ინფო არასრულია:
- employer ან city ცარიელია → ვებში ეძებე ან მომხმარებელს ეკითხე
- insight ცარიელია → საუბრის ბოლოს შეახსენე: „გინდა ამ ადამიანზე რამე შევინახო?"
- ტეგები მხოლოდ სახელებია → პირდაპირ მომხმარებელს ეკითხე დეტალებს

---

### 6. Pre-Meeting Brief
შეხვედრის მომზადებისას სტრუქტურულად:
**ვინ არის:** სახელი | პოზიცია | კომპანია | ქალაქი
**როგორ იცნობ:** პირდაპირი კონტაქტი / [სახელის] მეშვეობით
**რა ვიცით:** [tags + შენახული insights]
**ახლანდელი ინფო:** [verified ვებ შედეგი]
**შესაძლო საუბრის თემები:** [tags-სა და insight-ებზე დაყრდნობით]

---

### 7. Introduction Path
თუ პიროვნება მხოლოდ 2nd degree-შია:
- ნათლად მიუთითე შუამავალი: „[სახელი]-ის მეშვეობით შეიძლება გაიცნო"
- შეაფასე კავშირის სიძლიერე (რამდენი საერთო კონტაქტი, tags)
- ეკითხე: „გინდა Ally-ის მეშვეობით [შუამავალს] გაცნობის მოთხოვნა გავაგზავნო? ის Ally-ში მიიღებს შეტყობინებას და პირდაპირ გიპასუხებს."
- **არასოდეს** შეიმუშაო ხელით გასაგზავნი WhatsApp/SMS ტექსტი — გამოიყენე მხოლოდ request_introduction ტული
- მომხმარებლის „კი"-ს შემდეგ დაუყოვნებლად გამოიძახე request_introduction ტული
- თუ ტული დააბრუნებს push_sent=false — უთხარი: „მოთხოვნა შეიქმნა. [შუამავალი] ნოტიფიკაციას ვერ მიიღებს, მაგრამ დაინახავს Ally-ს შემდეგ გახსნისას."
- **არ** შესთავაზო WhatsApp/SMS/email ალტერნატივა — Ally-ს სისტემა საკმარისია
- თუ ტული დააბრუნებს needs_disambiguation=true — მხოლოდ ეს წარმოთქვი: „რამდენიმე [სახელი] ვიპოვე, აირჩიე:" — სახელების ჩამოთვლა არ გჭირდება, UI თავად გაჩვენებს. მომხმარებლის არჩევის შემდეგ გამოიძახე request_introduction ტული mediator_phone პარამეტრით.

---

### 8. Profile Card — ყოველთვის ბოლოს
ნებისმიერი ძიების ბოლოს სუფთა summary:
**[სახელი]**
• პოზიცია/კომპანია: ...
• ქალაქი: ...
• კავშირი: [პირდაპირი / X-ის მეშვეობით]
• ტეგები: ...
• შენახული ინფო: ...
• წყარო: [კონტაქტები / ვებ / ორივე]

მომხმარებლის შესახებ ახალი ფაქტი (პროფესია, ქალაქი, ინტერესი)? შეინახე update_user_profile-ით.

---

### 9. გაცნობის მოთხოვნებზე პასუხი (შუამავლის როლი)
თუ სისტემის კონტექსტში ჩანს „გაუხსნელი გაცნობის მოთხოვნები" სექცია:
- **ეს არის შენი პირველი პასუხი — სხვა თემამდე ამას მიაქციე ყურადღება**
- მომხმარებლის ნებისმიერ შეტყობინებაზე (მათ შორის „გამარჯობა") **პირველ წინადადებაში** დაასახელე მოთხოვნა
- მაგ: „გამარჯობა! სანამ გიპასუხებ — მოსულა გაცნობის მოთხოვნა: [სახელი] გინდა გეცნოს [სახელი]-ს. დაეხმარები?"
- ჰკითხე: „თუ კი, რა ინფო ან საკონტაქტო გაუზიარო?"
- პასუხის მიღების შემდეგ გამოიყენე respond_to_introduction ტული
- გააფრთხილე: მხოლოდ ის ინფო გაიზიარო რაც მომხმარებელმა ნებაყოფლობით მოგცა

---

### 10. გაცნობის პასუხის ჩვენება (მომთხოვნის როლი)
თუ სისტემის კონტექსტში ჩანს „გაცნობის მოთხოვნების პასუხები" სექცია:
- **ეს არის შენი პირველი პასუხი — სხვა თემამდე ამას მიაქციე ყურადღება**
- მომხმარებლის ნებისმიერ შეტყობინებაზე (მათ შორის „გამარჯობა") **პირველ წინადადებაში** გაუზიარე პასუხი
- მაგ: „გამარჯობა! [შუამავალი] გიპასუხა — [target_name]-ზე [დათანხმდა/უარი თქვა]. [ინფო თუ არის]"
- თუ accepted — გაახარე, გაუზიარე შუამავლის მიერ გაზიარებული ინფო სრულად
- თუ declined — თანაგრძნობა, შესთავაზე სხვა მარშრუტი

---

### 11. კონტაქტის ფაქტების შეგროვება (მაქსიმუმ 1 კითხვა მთელ საუბარში)

**წესი 1 — ავტომატური შენახვა:**
კონტაქტზე ობიექტური ფაქტის (სამსახური, ქალაქი, პროფესია, სფერო) გაგება → დაუყოვნებლად გამოიძახე save_contact_fact (field_type: "occupation" / "employer" / "city" / "industry"), value — მოკლე და კონკრეტული (მაგ: "ფეხბურთელი", "TBC Bank", "თბილისი"). შენახვის შემდეგ ერთი სტრიქონი: „შენახულია: [სახელი] — [field]: [value] ✓" (is_public=true → „✓ (2+ ადამიანი ადასტურებს)", is_public=false → „✓ (პრაივეთი)"). შენახვა ყოველთვის ხდება ნებართვის გარეშე.

**წესი 2 — კონტაქტის ხარვეზის კითხვა:**
კონტაქტის პროფილის ჩვენებამდე გამოიძახე get_contact_facts და ფაქტები Profile Card-ში ჩართე. თუ პასუხში ask_about != null **და ამ საუბარში ჯერ კითხვა არ დაგისვამს**:
- response-ის ბოლოს ბუნებრივად დასვი 1 კითხვა ამ ველის შესახებ
- მაგ. ask_about="employer" → „სხვათა შორის, სად მუშაობს [სახელი]?"
- ეს ითვლება საუბრის 1 კითხვად — სხვა კითხვა ამ საუბარში აღარ დაუსვა

**წესი 3 — მომხმარებლის პროფილი:**
სისტემის კონტექსტში ჩანს „შენი ინფო — გამოტოვებული ველები"? თუ ამ საუბარში **ჯერ** კითხვა არ დაგისვამს:
- საუბრის ბოლოს კონტექსტურად დასვი 1 კითხვა პირველ გამოტოვებულ ველზე
- მაგ. profession → „ხოლო შენ, სად მუშაობ?"
- ეს ითვლება საუბრის 1 კითხვად

**კომბინირებული წესი:** მთელ საუბარში მაქსიმუმ **1 კითხვა** — კონტაქტის ხარვეზი (წ.2) პრიორიტეტულია მომხმარებლის ინფოზე (წ.3).

---

### 12. არჩევანის სია — ყოველთვის present_choices
როდესაც მომხმარებელს სიიდან არჩევანი უნდა გაუკეთო (მაგ. რამდენი კონტაქტი ნაპოვნია, ან კითხვაა "რომელი?"):
- **ნუ** ჩამოთვლი bullet-ებად ტექსტში
- გამოიძახე \`present_choices\` ტული \`items=[...]\` პარამეტრით
- ტექსტში მხოლოდ მოკლე კითხვა: მაგ. „რამდენიმე [სახელი] ვიპოვე, რომელი?"
- UI თავად გამოაჩენს clickable ღილაკებს — სიის ხელით ჩამოთვლა არ გჭირდება

---

### 13. ტექსტის ფორმატი
- **არასოდეს** გამოიყენო markdown ცხრილები (| სახელი | ... |) — UI არ ასახავს მათ სწორად
- რამდენიმე კონტაქტის ჩამოთვლა: გამოიყენე ნუმერირებული სია ბრტყელ ტექსტში:
  1. Tako (TBC Bank) — Teona Panchulidze-ს მეშვეობით
- ყველა სხვა ფორმატირება (bold, სიები) — ნორმალურია`;

interface ConversationRow {
  role: string;
  content: string;
  content_json: Anthropic.MessageParam['content'] | null;
}

interface AnthropicToolProperty {
  type: string;
  description: string;
  items?: { type: string };
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, AnthropicToolProperty>;
    required: string[];
  };
}

const REQUEST_INTRODUCTION_TOOL: AnthropicTool = {
  name: 'request_introduction',
  description:
    "Send an introduction request to a mutual contact (mediator). Call only after the user explicitly confirms they want to send the request. The mediator must be in the user's contact list.",
  input_schema: {
    type: 'object',
    properties: {
      mediator_name: {
        type: 'string',
        description: 'Full name of the contact who will mediate the introduction',
      },
      mediator_phone: {
        type: 'string',
        description:
          'Phone number of the mediator (use when name search fails or user provides a phone number directly)',
      },
      target_name: {
        type: 'string',
        description: 'Name of the person the user wants to be introduced to',
      },
      target_user_id: {
        type: 'number',
        description:
          'Ally user ID of the target (from search result target_user_id field). Use when the target is a registered Ally user.',
      },
      target_phone: {
        type: 'string',
        description:
          'Phone number of the target (from search result target_phone field). Use when the target is not a registered Ally user.',
      },
      message: {
        type: 'string',
        description: 'Optional context message for the mediator',
      },
    },
    required: ['mediator_name', 'target_name'],
  },
};

const RESPOND_TO_INTRODUCTION_TOOL: AnthropicTool = {
  name: 'respond_to_introduction',
  description:
    'Respond to a pending introduction request (when acting as mediator). Call after the user decides whether to help and what information to share.',
  input_schema: {
    type: 'object',
    properties: {
      request_id: {
        type: 'number',
        description: 'The ID of the introduction request from the system context',
      },
      accepted: {
        type: 'boolean',
        description: 'Whether the mediator agrees to help with the introduction',
      },
      response: {
        type: 'string',
        description:
          'Contact info or instructions for the requester (if accepted), or reason for declining',
      },
    },
    required: ['request_id', 'accepted'],
  },
};

const GET_THREAD_CONTEXT_TOOL: AnthropicTool = {
  name: 'get_thread_context',
  description:
    "Read recent messages from the user's other conversation threads. Use only when the user explicitly asks about something discussed in another thread.",
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

const PRESENT_CHOICES_TOOL: AnthropicTool = {
  name: 'present_choices',
  description:
    'Present a list of options for the user to tap and select. Call this instead of listing options as bullet points in text. The UI renders them as tappable buttons. The selected item will arrive as the next user message.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: { type: 'string' },
        description: 'The options to display as tappable buttons',
      },
    },
    required: ['items'],
  },
};

const SAVE_CONTACT_FACT_TOOL: AnthropicTool = {
  name: 'save_contact_fact',
  description:
    "Save an objective fact about a contact (occupation, employer, city, industry). Call whenever the user mentions such a fact. The system will automatically verify it against other users' input and make it public if confirmed.",
  input_schema: {
    type: 'object',
    properties: {
      neo4j_contact_id: {
        type: 'string',
        description: 'The Neo4j contact ID from search results',
      },
      field_type: {
        type: 'string',
        description: 'One of: "occupation", "employer", "city", "industry"',
      },
      value: {
        type: 'string',
        description:
          'The fact value, concise and in original language (e.g. "ფეხბურთელი", "TBC Bank", "თბილისი")',
      },
    },
    required: ['neo4j_contact_id', 'field_type', 'value'],
  },
};

const GET_CONTACT_FACTS_TOOL: AnthropicTool = {
  name: 'get_contact_facts',
  description:
    "Get stored facts about a contact — both public (confirmed by 2+ users) and the current user's own private entries. Returns { facts: [...], ask_about: string|null } where ask_about is the highest-priority field not yet recorded for this contact. Call when displaying a contact's profile.",
  input_schema: {
    type: 'object',
    properties: {
      neo4j_contact_id: {
        type: 'string',
        description: 'The Neo4j contact ID',
      },
    },
    required: ['neo4j_contact_id'],
  },
};

const UPDATE_USER_PROFILE_TOOL: AnthropicTool = {
  name: 'update_user_profile',
  description:
    'Save a fact learned about the user — profession, city, interest, preference, or frequently searched topics. Call once per field.',
  input_schema: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: 'Field name, e.g. "profession", "city", "interests", "language"',
      },
      value: { type: 'string', description: 'Value to store for this field' },
    },
    required: ['key', 'value'],
  },
};

const ALL_TOOL_DEFINITIONS: Record<string, AnthropicTool> = {
  lookup_contact_by_phone: {
    name: 'lookup_contact_by_phone',
    description:
      'Looks up a contact in Neo4j by phone number. Use every time the user mentions a phone number.',
    input_schema: {
      type: 'object',
      properties: {
        phone_number: { type: 'string', description: 'Phone number in any format.' },
      },
      required: ['phone_number'],
    },
  },
  search_contact_by_name: {
    name: 'search_contact_by_name',
    description:
      'Search contacts by first name, last name, or full name. Use this when the user mentions a person by name instead of phone number. Returns up to 5 matching contacts with their phone numbers and details.',
    input_schema: {
      type: 'object',
      properties: {
        name_query: {
          type: 'string',
          description:
            'The name or partial name to search for. Can be first name, last name, or full name.',
        },
      },
      required: ['name_query'],
    },
  },
  search_by_tag: {
    name: 'search_by_tag',
    description:
      'Search contacts by tag. Tags are keywords people have associated with contacts — job titles, skills, traits, names. Use this when the user is looking for someone by what they do or who they are. Example: "ხელოსანი", "IT", "ექიმი", "misho". Returns a list of matching contacts without phone or email.',
    input_schema: {
      type: 'object',
      properties: {
        tag_query: { type: 'string', description: 'The tag or keyword to search for.' },
      },
      required: ['tag_query'],
    },
  },
  search_by_insight: {
    name: 'search_by_insight',
    description:
      "Search contacts using previously saved information collected from users by the assistant. Use this when the user is looking for someone based on details the assistant has already recorded — for example: 'სანდო ხელოსანი', 'კარგი ექიმი'. This searches the assistant's own saved knowledge base.",
    input_schema: {
      type: 'object',
      properties: {
        search_query: {
          type: 'string',
          description: 'The keyword or phrase to search in saved contact information.',
        },
      },
      required: ['search_query'],
    },
  },
  search_second_degree: {
    name: 'search_second_degree',
    description:
      "Search for contacts of contacts (2nd degree) by tag or keyword. Use this when search_by_tag returns no results, or when the user asks about someone who might be known through their contacts. Returns matches with the name of the mutual contact (via). Example: user asks for a plumber but has none directly — this finds plumbers in their contacts' contact lists.",
    input_schema: {
      type: 'object',
      properties: {
        tag_query: {
          type: 'string',
          description:
            'The tag, job title, skill, or keyword to search for in 2nd degree contacts.',
        },
      },
      required: ['tag_query'],
    },
  },
  search_contacts_by_country: {
    name: 'search_contacts_by_country',
    description:
      'Search direct contacts and contacts-of-contacts by country. Use when the user asks about contacts in a specific country or location (e.g. "გერმანიაში ვინმე მყავს?", "find contacts in Germany"). Returns both direct contacts and second-degree contacts with their mutual contact.',
    input_schema: {
      type: 'object',
      properties: {
        country: {
          type: 'string',
          description:
            'Country name in any language (Georgian or English), e.g. "გერმანია", "Germany", "ამერიკა", "USA".',
        },
      },
      required: ['country'],
    },
  },
  get_contact_count: {
    name: 'get_contact_count',
    description:
      'Returns the total number of contacts the user has imported. Use when the user asks how many contacts they have.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  web_search: {
    name: 'web_search',
    description:
      'Search the web for public information about a person, company, or topic. Use after finding a contact in the database to enrich with LinkedIn, company details, news, or other public info. Also use when the user asks general questions that require up-to-date information.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Search query. For person lookup include their name and company or job title for best results.',
        },
      },
      required: ['query'],
    },
  },
};

function toAnthropicTool(tool: ChatToolDefinition<never, unknown>): AnthropicTool {
  const properties: Record<string, AnthropicToolProperty> = {};
  const required: string[] = [];

  for (const [key, param] of Object.entries(tool.parameters)) {
    properties[key] = { type: param.type, description: param.description };
    if (param.required) required.push(key);
  }

  return {
    name: tool.name,
    description: tool.description,
    input_schema: { type: 'object', properties, required },
  };
}

function hasToolResults(msg: Anthropic.MessageParam): boolean {
  return (
    msg.role === 'user' &&
    Array.isArray(msg.content) &&
    msg.content.some((b) => (b as { type: string }).type === 'tool_result')
  );
}

async function loadHistory(threadId: number): Promise<Anthropic.MessageParam[]> {
  const result = await query<ConversationRow>(
    'SELECT role, content, content_json FROM conversations WHERE thread_id = $1 ORDER BY created_at DESC LIMIT $2',
    [threadId, HISTORY_LIMIT],
  );
  const rows = result.rows.reverse().map((row) => ({
    role: row.role as 'user' | 'assistant',
    content:
      row.content_json !== null
        ? (row.content_json as Anthropic.MessageParam['content'])
        : row.content,
  }));

  // Strip trailing incomplete exchanges — must end with a pure-text assistant message.
  // A message with tool_use blocks (even alongside text) is not a valid endpoint because
  // it requires a following tool_result; without it the next API call is rejected.
  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last.role === 'assistant') {
      const c = last.content;
      const isCompleteText =
        typeof c === 'string'
          ? c.length > 0
          : Array.isArray(c) &&
            c.some((b) => b.type === 'text') &&
            !c.some((b) => b.type === 'tool_use');
      if (isCompleteText) break;
    }
    rows.pop();
  }

  // Strip leading orphaned tool_result or assistant messages — Anthropic requires
  // the conversation to start with a user message.
  while (rows.length > 0 && (hasToolResults(rows[0]) || rows[0].role === 'assistant')) {
    rows.shift();
  }

  return rows;
}

async function saveMessage(
  userId: string,
  threadId: number,
  role: 'user' | 'assistant',
  content: Anthropic.MessageParam['content'],
): Promise<void> {
  const textContent = typeof content === 'string' ? content : '';
  await query(
    'INSERT INTO conversations (user_id, thread_id, role, content, content_json) VALUES ($1, $2, $3, $4, $5::jsonb)',
    [userId, threadId, role, textContent, JSON.stringify(content)],
  );
  await touchThread(threadId);
}

function buildProfileSection(profile: Record<string, unknown>): string {
  const keys = Object.keys(profile);
  if (keys.length === 0) return '';
  const lines = keys.map((k) => `- ${k}: ${profile[k]}`).join('\n');
  return `\n\n## მომხმარებლის ინფო\n${lines}`;
}

function buildMissingUserProfileSection(profile: Record<string, unknown>): string {
  const missing = USER_PROFILE_PRIORITY_FIELDS.filter((f) => !(f in profile));
  if (missing.length === 0) return '';
  return `\n\n## შენი ინფო — გამოტოვებული ველები\n${missing.join(', ')}`;
}

function buildPendingRequestsSection(requests: PendingRequest[]): string {
  if (requests.length === 0) return '';
  const lines = requests
    .map((r) => {
      const who = r.requester_name ?? 'Ally-ს მომხმარებელი';
      const msg = r.message ? ` შეტყობინება: "${r.message}"` : '';
      return `- მოთხოვნა #${r.id}: ${who} გინდა გეცნოს ${r.target_name}-ს.${msg} (respond_to_introduction-ისთვის request_id=${r.id})`;
    })
    .join('\n');
  return `\n\n## გაუხსნელი გაცნობის მოთხოვნები\n${lines}`;
}

function buildRespondedRequestsSection(responses: RespondedRequest[]): string {
  if (responses.length === 0) return '';
  const lines = responses
    .map((r) => {
      const statusText = r.status === 'accepted' ? 'დათანხმდა' : 'უარი თქვა';
      const info = r.mediator_response ? ` ინფო: "${r.mediator_response}"` : '';
      return `- ${r.target_name}: შუამავალი ${statusText}.${info}`;
    })
    .join('\n');
  return `\n\n## გაცნობის მოთხოვნების პასუხები [FIRST PRIORITY — პირველ წინადადებაში გაუზიარე]\n${lines}`;
}

function buildInsightFieldsSection(
  fields: Array<{ field_label: string; field_description: string }>,
): string {
  if (fields.length === 0) return '';
  const lines = fields.map((f) => `- ${f.field_label}: ${f.field_description}`).join('\n');
  return `\n\n## კონტაქტის ინფოს შეგროვება\nკონტაქტის წარდგენის შემდეგ ჰკითხე:\n${lines}\n\nშეინახე save_contact_insight-ით. გამოიყენე search_by_insight-ით.`;
}

async function buildAgentSystemPrompt(userId: string, threadType?: string): Promise<string> {
  const [configResult, fieldsResult, profile, pendingRequests, recentResponses] = await Promise.all(
    [
      query<{ system_prompt: string }>(
        'SELECT system_prompt FROM ai_config ORDER BY id DESC LIMIT 1',
      ),
      query<{ field_label: string; field_description: string }>(
        'SELECT field_label, field_description FROM insight_fields WHERE is_active = true ORDER BY created_at ASC',
      ),
      getUserProfile(userId),
      threadType === 'incoming_request' || threadType === 'outgoing_request'
        ? Promise.resolve([] as PendingRequest[])
        : getPendingRequestsForMediator(userId),
      threadType === 'incoming_request' || threadType === 'outgoing_request'
        ? Promise.resolve([] as RespondedRequest[])
        : getRecentResponsesForRequester(userId),
    ],
  );

  const base = configResult.rows[0]?.system_prompt ?? '';
  return (
    base +
    AGENT_STRATEGY_PROMPT +
    buildProfileSection(profile) +
    buildMissingUserProfileSection(profile) +
    buildInsightFieldsSection(fieldsResult.rows) +
    buildPendingRequestsSection(pendingRequests) +
    buildRespondedRequestsSection(recentResponses)
  );
}

async function executeToolCall(
  userId: string,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'lookup_contact_by_phone':
      return lookupContactByPhone(input['phone_number'] as string);
    case 'get_contact_insight':
      return getContactInsight(input['userId'] as string, input['neo4j_contact_id'] as string);
    case 'search_contact_by_name':
      return searchContactByName(userId, input['name_query'] as string);
    case 'search_by_tag':
      return searchByTag(userId, input['tag_query'] as string);
    case 'search_by_insight':
      return searchByInsight(input['search_query'] as string);
    case 'search_second_degree':
      return searchSecondDegree(userId, input['tag_query'] as string);
    case 'search_contacts_by_country':
      return searchContactsByCountry(userId, input['country'] as string);
    case 'get_contact_count':
      return getContactCount(userId);
    case 'web_search':
      return webSearch(input['query'] as string);
    case 'save_contact_insight':
      return saveContactInsight(
        input['userId'] as string,
        input['neo4j_contact_id'] as string,
        input['contact_name'] as string,
        input['collected_data'] as Record<string, unknown>,
      );
    case 'update_user_profile':
      return setUserProfileField(userId, input['key'] as string, input['value'] as string);
    case 'request_introduction':
      return requestIntroduction(
        userId,
        input['mediator_name'] as string,
        input['target_name'] as string,
        input['message'] as string | undefined,
        input['mediator_phone'] as string | undefined,
        input['target_user_id'] as number | undefined,
        input['target_phone'] as string | undefined,
      );
    case 'respond_to_introduction':
      return respondToIntroduction(
        userId,
        input['request_id'] as number,
        input['accepted'] as boolean,
        input['response'] as string | undefined,
      );
    case 'get_thread_context':
      return getThreadContext(userId);
    case 'save_contact_fact':
      return submitContactFact(
        userId,
        input['neo4j_contact_id'] as string,
        input['field_type'] as string,
        input['value'] as string,
      );
    case 'get_contact_facts':
      return getVisibleFacts(userId, input['neo4j_contact_id'] as string);
    case 'present_choices':
      return { presented: true };
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function processToolBlocks(
  userId: string,
  content: Anthropic.ContentBlock[],
): Promise<Anthropic.ToolResultBlockParam[]> {
  const results: Anthropic.ToolResultBlockParam[] = [];
  for (const block of content) {
    if (block.type !== 'tool_use') continue;
    const result = await executeToolCall(
      userId,
      block.name,
      block.input as Record<string, unknown>,
    );
    results.push({
      type: 'tool_result',
      tool_use_id: block.id,
      content: JSON.stringify(result),
    });
  }
  return results;
}

const CLAUDE_CALL_TIMEOUT_MS = 30_000;

async function callClaude(
  messages: Anthropic.MessageParam[],
  systemPrompt: string,
  tools: AnthropicTool[],
): Promise<Anthropic.Message> {
  return anthropic.messages.create(
    {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools,
      messages,
    },
    { timeout: CLAUDE_CALL_TIMEOUT_MS },
  );
}

interface PendingMessage {
  role: 'user' | 'assistant';
  content: Anthropic.MessageParam['content'];
}

export interface ChatResult {
  reply: string;
  options?: DisambiguationCandidate[];
  choices?: string[];
}

async function runToolLoop(
  userId: string,
  messages: Anthropic.MessageParam[],
  systemPrompt: string,
  tools: AnthropicTool[],
): Promise<{
  finalText: string;
  pending: PendingMessage[];
  options?: DisambiguationCandidate[];
  choices?: string[];
}> {
  const pending: PendingMessage[] = [];
  let response = await callClaude(messages, systemPrompt, tools);
  let options: DisambiguationCandidate[] | undefined;
  let choices: string[] | undefined;

  while (response.stop_reason === 'tool_use') {
    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === 'present_choices') {
        const input = block.input as { items?: unknown };
        if (Array.isArray(input.items)) {
          choices = input.items.filter((i): i is string => typeof i === 'string');
        }
      }
    }

    const toolResults = await processToolBlocks(userId, response.content);

    for (const result of toolResults) {
      if (typeof result.content === 'string') {
        const parsed = JSON.parse(result.content) as Record<string, unknown>;
        if (parsed.needs_disambiguation === true && Array.isArray(parsed.candidates)) {
          options = parsed.candidates as DisambiguationCandidate[];
        }
      }
    }

    pending.push({ role: 'assistant', content: response.content });
    pending.push({ role: 'user', content: toolResults });

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });

    response = await callClaude(messages, systemPrompt, tools);
  }

  const finalText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return { finalText, pending, options, choices };
}

async function buildEnabledTools(userId: string): Promise<AnthropicTool[]> {
  const [enabledKeys, insightTools] = await Promise.all([
    getEnabledToolKeys(),
    Promise.resolve(getContactInsightTools(userId).map(toAnthropicTool)),
  ]);
  return [
    ...insightTools,
    UPDATE_USER_PROFILE_TOOL,
    SAVE_CONTACT_FACT_TOOL,
    GET_CONTACT_FACTS_TOOL,
    REQUEST_INTRODUCTION_TOOL,
    RESPOND_TO_INTRODUCTION_TOOL,
    GET_THREAD_CONTEXT_TOOL,
    PRESENT_CHOICES_TOOL,
    ...enabledKeys
      .filter((key) => key in ALL_TOOL_DEFINITIONS)
      .map((key) => ALL_TOOL_DEFINITIONS[key]),
  ];
}

export async function processChat(
  userId: string,
  threadId: number,
  userMessage: string,
): Promise<ChatResult> {
  const thread = await getThread(threadId, userId);
  if (thread === null) {
    throw new Error(`Thread ${threadId} not found for user ${userId}`);
  }

  const [systemPrompt, tools, history] = await Promise.all([
    buildAgentSystemPrompt(userId, thread.type),
    buildEnabledTools(userId),
    loadHistory(threadId),
  ]);

  const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: userMessage }];

  // Run the tool loop without touching the DB — if it throws, nothing is saved
  const { finalText, pending, options, choices } = await runToolLoop(
    userId,
    messages,
    systemPrompt,
    tools,
  );

  // Persist only after full success: user message → tool interactions → final reply
  await saveMessage(userId, threadId, 'user', userMessage);
  for (const msg of pending) {
    await saveMessage(userId, threadId, msg.role, msg.content);
  }
  await saveMessage(userId, threadId, 'assistant', finalText);

  return { reply: finalText, ...(options && { options }), ...(choices && { choices }) };
}

export { getOrCreateDefaultThread };

export function getContactInsightTools(
  userId: string,
): Array<
  | ChatToolDefinition<SaveContactInsightParams, unknown>
  | ChatToolDefinition<GetContactInsightParams, unknown>
> {
  return [createSaveContactInsightTool(userId), createGetContactInsightTool(userId)];
}

export async function buildContactInsightSystemPrompt(): Promise<string> {
  const result = await query<{ system_prompt: string }>(
    'SELECT system_prompt FROM ai_config ORDER BY id DESC LIMIT 1',
  );
  return result.rows[0]?.system_prompt ?? '';
}
