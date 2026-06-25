import { query } from '../../db/postgres/client';
import { getSession } from '../../db/neo4j/client';
import { getCompositeKeyForUser } from '../neo4j.keys';

const MAX_FRIEND_PHONES = 3000;
const MAX_FRIEND_PHONES_FOR_QUERY = 200;
const QUERY_TIMEOUT_MS = 10_000;

const COUNTRY_PREFIX_MAP: Record<string, string> = {
  // Georgia
  georgia: '+995',
  საქართველო: '+995',
  ge: '+995',
  // Germany
  germany: '+49',
  გერმანია: '+49',
  deutschland: '+49',
  de: '+49',
  // USA
  usa: '+1',
  us: '+1',
  'united states': '+1',
  america: '+1',
  ამერიკა: '+1',
  აშშ: '+1',
  'united states of america': '+1',
  // Canada
  canada: '+1',
  კანადა: '+1',
  // UK
  uk: '+44',
  'united kingdom': '+44',
  britain: '+44',
  england: '+44',
  ინგლისი: '+44',
  ბრიტანეთი: '+44',
  'დიდი ბრიტანეთი': '+44',
  // Russia
  russia: '+7',
  რუსეთი: '+7',
  ru: '+7',
  // Turkey
  turkey: '+90',
  თურქეთი: '+90',
  türkiye: '+90',
  // Armenia
  armenia: '+374',
  სომხეთი: '+374',
  // Azerbaijan
  azerbaijan: '+994',
  აზერბაიჯანი: '+994',
  // France
  france: '+33',
  საფრანგეთი: '+33',
  // Italy
  italy: '+39',
  იტალია: '+39',
  // Spain
  spain: '+34',
  ესპანეთი: '+34',
  // Netherlands
  netherlands: '+31',
  holland: '+31',
  ნიდერლანდები: '+31',
  ჰოლანდია: '+31',
  // Poland
  poland: '+48',
  პოლონეთი: '+48',
  // Ukraine
  ukraine: '+380',
  უკრაინა: '+380',
  // Israel
  israel: '+972',
  ისრაელი: '+972',
  // UAE
  uae: '+971',
  'united arab emirates': '+971',
  emirates: '+971',
  ემირატები: '+971',
  არაბეთი: '+971',
  გაემ: '+971',
  // China
  china: '+86',
  ჩინეთი: '+86',
  // Japan
  japan: '+81',
  იაპონია: '+81',
  // India
  india: '+91',
  ინდოეთი: '+91',
  // Australia
  australia: '+61',
  ავსტრალია: '+61',
  // Austria
  austria: '+43',
  ავსტრია: '+43',
  // Switzerland
  switzerland: '+41',
  შვეიცარია: '+41',
  // Belgium
  belgium: '+32',
  ბელგია: '+32',
  // Sweden
  sweden: '+46',
  შვედეთი: '+46',
  // Norway
  norway: '+47',
  ნორვეგია: '+47',
  // Denmark
  denmark: '+45',
  დანია: '+45',
  // Finland
  finland: '+358',
  ფინეთი: '+358',
  // Czech Republic
  'czech republic': '+420',
  czechia: '+420',
  ჩეხეთი: '+420',
  // Romania
  romania: '+40',
  რუმინეთი: '+40',
  // Greece
  greece: '+30',
  საბერძნეთი: '+30',
  // Portugal
  portugal: '+351',
  პორტუგალია: '+351',
  // Hungary
  hungary: '+36',
  უნგრეთი: '+36',
  // Bulgaria
  bulgaria: '+359',
  ბულგარეთი: '+359',
  // Serbia
  serbia: '+381',
  სერბეთი: '+381',
  // Croatia
  croatia: '+385',
  ხორვატია: '+385',
  // Belarus
  belarus: '+375',
  ბელორუსია: '+375',
  // Lithuania
  lithuania: '+370',
  ლიტვა: '+370',
  // Latvia
  latvia: '+371',
  ლატვია: '+371',
  // Estonia
  estonia: '+372',
  ესტონეთი: '+372',
  // Slovakia
  slovakia: '+421',
  სლოვაკეთი: '+421',
  // Slovenia
  slovenia: '+386',
  სლოვენია: '+386',
  // Moldova
  moldova: '+373',
  მოლდოვა: '+373',
  // Kazakhstan
  kazakhstan: '+7',
  ყაზახეთი: '+7',
  // Kyrgyzstan
  kyrgyzstan: '+996',
  ყირგიზეთი: '+996',
  // Tajikistan
  tajikistan: '+992',
  ტაჯიკეთი: '+992',
  // Uzbekistan
  uzbekistan: '+998',
  უზბეკეთი: '+998',
  // Turkmenistan
  turkmenistan: '+993',
  თურქმენეთი: '+993',
  // Brazil
  brazil: '+55',
  ბრაზილია: '+55',
  // Mexico
  mexico: '+52',
  მექსიკა: '+52',
  // Argentina
  argentina: '+54',
  არგენტინა: '+54',
  // South Korea
  'south korea': '+82',
  korea: '+82',
  'სამხრეთ კორეა': '+82',
  კორეა: '+82',
  // South Africa
  'south africa': '+27',
  'სამხრეთ აფრიკა': '+27',
  // Egypt
  egypt: '+20',
  ეგვიპტე: '+20',
  // Saudi Arabia
  'saudi arabia': '+966',
  saudi: '+966',
  'საუდის არაბეთი': '+966',
  // Iran
  iran: '+98',
  ირანი: '+98',
  // Pakistan
  pakistan: '+92',
  პაკისტანი: '+92',
  // Ireland
  ireland: '+353',
  ირლანდია: '+353',
  // Singapore
  singapore: '+65',
  სინგაპური: '+65',
  // Malaysia
  malaysia: '+60',
  მალაიზია: '+60',
  // Thailand
  thailand: '+66',
  ტაილანდი: '+66',
  // Vietnam
  vietnam: '+84',
  ვიეტნამი: '+84',
  // Indonesia
  indonesia: '+62',
  ინდონეზია: '+62',
  // Philippines
  philippines: '+63',
  ფილიპინები: '+63',
  // New Zealand
  'new zealand': '+64',
  'ახალი ზელანდია': '+64',
  // Luxembourg
  luxembourg: '+352',
  ლუქსემბურგი: '+352',
  // Iceland
  iceland: '+354',
  ისლანდია: '+354',
  // Albania
  albania: '+355',
  ალბანეთი: '+355',
  // North Macedonia
  'north macedonia': '+389',
  macedonia: '+389',
  მაკედონია: '+389',
  // Bosnia
  bosnia: '+387',
  ბოსნია: '+387',
  // Montenegro
  montenegro: '+382',
  მონტენეგრო: '+382',
  // Kosovo
  kosovo: '+383',
  კოსოვო: '+383',
  // Cyprus
  cyprus: '+357',
  კვიპროსი: '+357',
  // Malta
  malta: '+356',
  მალტა: '+356',
  // Morocco
  morocco: '+212',
  მაროკო: '+212',
  // Algeria
  algeria: '+213',
  ალჟირი: '+213',
  // Tunisia
  tunisia: '+216',
  ტუნისი: '+216',
  // Kuwait
  kuwait: '+965',
  კუვეიტი: '+965',
  // Qatar
  qatar: '+974',
  კატარი: '+974',
  // Bahrain
  bahrain: '+973',
  ბაჰრეინი: '+973',
  // Oman
  oman: '+968',
  ომანი: '+968',
  // Jordan
  jordan: '+962',
  იორდანია: '+962',
  // Lebanon
  lebanon: '+961',
  ლიბანი: '+961',
  // Iraq
  iraq: '+964',
  ერაყი: '+964',
  // Afghanistan
  afghanistan: '+93',
  ავღანეთი: '+93',
  // Nepal
  nepal: '+977',
  ნეპალი: '+977',
  // Sri Lanka
  'sri lanka': '+94',
  'შრი-ლანკა': '+94',
  // Mongolia
  mongolia: '+976',
  მონღოლეთი: '+976',
  // Taiwan
  taiwan: '+886',
  ტაივანი: '+886',
  // Hong Kong
  'hong kong': '+852',
  'ჰონგ კონგი': '+852',
  // Chile
  chile: '+56',
  ჩილე: '+56',
  // Colombia
  colombia: '+57',
  კოლუმბია: '+57',
  // Venezuela
  venezuela: '+58',
  ვენესუელა: '+58',
  // Peru
  peru: '+51',
  პერუ: '+51',
  // Ecuador
  ecuador: '+593',
  ეკვადორი: '+593',
  // Bolivia
  bolivia: '+591',
  ბოლივია: '+591',
  // Uruguay
  uruguay: '+598',
  ურუგვაი: '+598',
  // Cuba
  cuba: '+53',
  კუბა: '+53',
  // Panama
  panama: '+507',
  პანამა: '+507',
};

function resolvePrefix(country: string): string | null {
  const key = country.toLowerCase().trim();
  if (COUNTRY_PREFIX_MAP[key]) return COUNTRY_PREFIX_MAP[key];
  if (/^\+\d+$/.test(country)) return country;
  return null;
}

export async function searchContactsByCountry(userId: string, country: string): Promise<object> {
  const prefix = resolvePrefix(country);
  if (!prefix) return { found: false, reason: 'unknown_country', country };

  const phonePattern = prefix + '%';

  const directResult = await query<{ name: string | null }>(
    `SELECT DISTINCT ON (ua.phone) ua.alias AS name
     FROM "UserAlias" ua
     WHERE ua."contactId" = $1 AND ua.phone LIKE $2
     ORDER BY ua.phone
     LIMIT 50`,
    [userId, phonePattern],
    QUERY_TIMEOUT_MS,
  );

  let userKey: string;
  try {
    userKey = await getCompositeKeyForUser(Number(userId));
  } catch {
    return {
      found: directResult.rows.length > 0,
      prefix,
      direct_contacts: directResult.rows.map((r) => ({ name: r.name })),
      second_degree_contacts: [],
    };
  }

  const userPhones = userKey.split('-');
  const session = getSession();
  let friendKeys: string[] = [];
  try {
    const neo4jResult = await session.run(
      `MATCH (me:AllyNode {phoneKey: $userKey})-[:CONTACT]->(friend:AllyNode)
       RETURN DISTINCT friend.phoneKey AS phoneKey
       LIMIT ${MAX_FRIEND_PHONES}`,
      { userKey },
      { timeout: 8000 },
    );
    friendKeys = neo4jResult.records
      .map((r) => r.get('phoneKey') as string | null)
      .filter((p): p is string => p !== null);

    if (friendKeys.length === 0 && userPhones.length > 1) {
      const fallback = await session.run(
        `UNWIND $userPhones AS phone
         MATCH (me:AllyNode {phoneKey: phone})-[:CONTACT]->(friend:AllyNode)
         RETURN DISTINCT friend.phoneKey AS phoneKey
         LIMIT ${MAX_FRIEND_PHONES}`,
        { userPhones },
        { timeout: 8000 },
      );
      friendKeys = fallback.records
        .map((r) => r.get('phoneKey') as string | null)
        .filter((p): p is string => p !== null);
    }
  } catch (neo4jErr) {
    console.error('searchContactsByCountry neo4j error:', (neo4jErr as Error).message);
    return {
      found: directResult.rows.length > 0,
      prefix,
      direct_contacts: directResult.rows.map((r) => ({ name: r.name })),
      second_degree_contacts: [],
    };
  } finally {
    await session.close();
  }

  const friendPhones = [...new Set(friendKeys.flatMap((k) => k.split('-')))].slice(
    0,
    MAX_FRIEND_PHONES_FOR_QUERY,
  );

  interface SecondDegreeRow {
    name: string | null;
    via_names: string[] | null;
  }

  let secondDegree: Array<{ name: string | null; via: string[] }> = [];

  if (friendPhones.length > 0) {
    try {
      const sdResult = await query<SecondDegreeRow>(
        `WITH friend_users AS (
           SELECT up."userId", up.phone AS via_phone
           FROM "UserPhone" up
           WHERE up.phone = ANY($2)
         ),
         matches AS (
           SELECT ua_m.phone, ua_m."contactId", ua_m.alias
           FROM "UserAlias" ua_m
           JOIN friend_users fu ON fu."userId" = ua_m."contactId"
           WHERE ua_m.phone LIKE $3
         )
         SELECT MAX(m.alias)                                                      AS name,
                array_agg(DISTINCT COALESCE(ua_via.alias, u_via.name))
                  FILTER (WHERE COALESCE(ua_via.alias, u_via.name) IS NOT NULL)  AS via_names
         FROM matches m
         JOIN friend_users fu         ON fu."userId" = m."contactId"
         LEFT JOIN "UserAlias" ua_own ON ua_own.phone = m.phone AND ua_own."contactId" = $1
         LEFT JOIN "UserAlias" ua_via ON ua_via.phone = fu.via_phone AND ua_via."contactId" = $1
         LEFT JOIN "UserPhone" up_via ON up_via.phone = fu.via_phone
         LEFT JOIN "User"      u_via  ON u_via.id     = up_via."userId"
         WHERE ua_own.phone IS NULL
         GROUP BY m.phone
         LIMIT 20`,
        [userId, friendPhones, phonePattern],
        QUERY_TIMEOUT_MS,
      );

      secondDegree = sdResult.rows.map((r) => ({
        name: r.name ?? null,
        via: r.via_names ?? [],
      }));
    } catch (err) {
      console.error('searchContactsByCountry second-degree query failed:', (err as Error).message);
    }
  }

  const total = directResult.rows.length + secondDegree.length;

  return {
    found: total > 0,
    country,
    prefix,
    direct_contacts: directResult.rows.map((r) => ({ name: r.name })),
    second_degree_contacts: secondDegree,
    total,
  };
}
