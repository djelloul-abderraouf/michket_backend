import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type DeliveryType = 'home' | 'office';

type DeliveryRate = {
  amountCents: number;
  currency: 'DZD';
  estimate: string | null;
};

type WilayaRateConfig = {
  home?: number;
  office?: number;
  estimate?: string;
};

type DeliveryRatesConfig = Record<string, WilayaRateConfig>;

type YalidineWilaya = {
  code: number;
  name: string;
  available: boolean;
  homeAvailable: boolean;
  officeAvailable: boolean;
};

type YalidineCommune = {
  id: number;
  name: string;
  wilayaCode: number;
  available: boolean;
  hasStopDesk: boolean;
  deliveryTime: string | null;
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const WILAYAS = [
  { code: 1, name: 'Adrar' },
  { code: 2, name: 'Chlef' },
  { code: 3, name: 'Laghouat' },
  { code: 4, name: 'Oum El Bouaghi' },
  { code: 5, name: 'Batna' },
  { code: 6, name: 'Béjaïa' },
  { code: 7, name: 'Biskra' },
  { code: 8, name: 'Béchar' },
  { code: 9, name: 'Blida' },
  { code: 10, name: 'Bouira' },
  { code: 11, name: 'Tamanrasset' },
  { code: 12, name: 'Tébessa' },
  { code: 13, name: 'Tlemcen' },
  { code: 14, name: 'Tiaret' },
  { code: 15, name: 'Tizi Ouzou' },
  { code: 16, name: 'Alger' },
  { code: 17, name: 'Djelfa' },
  { code: 18, name: 'Jijel' },
  { code: 19, name: 'Sétif' },
  { code: 20, name: 'Saïda' },
  { code: 21, name: 'Skikda' },
  { code: 22, name: 'Sidi Bel Abbès' },
  { code: 23, name: 'Annaba' },
  { code: 24, name: 'Guelma' },
  { code: 25, name: 'Constantine' },
  { code: 26, name: 'Médéa' },
  { code: 27, name: 'Mostaganem' },
  { code: 28, name: "M'Sila" },
  { code: 29, name: 'Mascara' },
  { code: 30, name: 'Ouargla' },
  { code: 31, name: 'Oran' },
  { code: 32, name: 'El Bayadh' },
  { code: 33, name: 'Illizi' },
  { code: 34, name: 'Bordj Bou Arréridj' },
  { code: 35, name: 'Boumerdès' },
  { code: 36, name: 'El Tarf' },
  { code: 37, name: 'Tindouf' },
  { code: 38, name: 'Tissemsilt' },
  { code: 39, name: 'El Oued' },
  { code: 40, name: 'Khenchela' },
  { code: 41, name: 'Souk Ahras' },
  { code: 42, name: 'Tipaza' },
  { code: 43, name: 'Mila' },
  { code: 44, name: 'Aïn Defla' },
  { code: 45, name: 'Naâma' },
  { code: 46, name: 'Aïn Témouchent' },
  { code: 47, name: 'Ghardaïa' },
  { code: 48, name: 'Relizane' },
  { code: 49, name: 'Timimoun' },
  { code: 50, name: 'Bordj Badji Mokhtar' },
  { code: 51, name: 'Ouled Djellal' },
  { code: 52, name: 'Béni Abbès' },
  { code: 53, name: 'In Salah' },
  { code: 54, name: 'In Guezzam' },
  { code: 55, name: 'Touggourt' },
  { code: 56, name: 'Djanet' },
  { code: 57, name: "El M'Ghair" },
  { code: 58, name: 'El Meniaa' },
] as const;

// Yalidine Stop Desk compatibility update: supports multiple fee field names.
const LOCATION_CACHE_TTL_MS = 60 * 60 * 1000;
const FEES_CACHE_TTL_MS = 10 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  private wilayasCache: CacheEntry<YalidineWilaya[]> | null =
    null;

  private readonly communesCache = new Map<
    number,
    CacheEntry<YalidineCommune[]>
  >();

  private readonly feesCache = new Map<
    string,
    CacheEntry<unknown>
  >();

  constructor(
    private readonly configService: ConfigService,
  ) {}

  /**
   * Server-authoritative delivery pricing.
   *
   * New Yalidine flow:
   * - destination wilaya + commune are required for an exact Yalidine rate;
   * - "home" uses Yalidine Express Home;
   * - "office" uses Yalidine Express Stop Desk when available.
   *
   * communeId stays optional temporarily so the existing checkout/order code
   * keeps compiling while we update the controller and frontend in the next
   * steps. When communeId is omitted we keep the old DELIVERY_RATES_JSON
   * behaviour only as a temporary compatibility fallback.
   */
  async calculateRate(
    toWilayaCode: number,
    deliveryType: DeliveryType = 'home',
    communeId?: number,
  ): Promise<DeliveryRate> {
    this.assertWilayaCode(toWilayaCode);

    if (
      deliveryType !== 'home' &&
      deliveryType !== 'office'
    ) {
      throw new BadRequestException(
        'Delivery type must be "home" or "office"',
      );
    }

    if (communeId == null) {
      this.logger.warn(
        'Delivery rate requested without communeId; using temporary legacy DELIVERY_RATES_JSON fallback',
      );

      return this.calculateLegacyRate(
        toWilayaCode,
        deliveryType,
      );
    }

    if (
      !Number.isInteger(communeId) ||
      communeId <= 0
    ) {
      throw new BadRequestException(
        'Commune id must be a positive integer',
      );
    }

    const communes =
      await this.getCommunes(toWilayaCode);

    const commune = communes.find(
      (item) => item.id === communeId,
    );

    if (!commune) {
      throw new BadRequestException(
        'Selected commune does not belong to the selected wilaya',
      );
    }

    if (!commune.available) {
      throw new ServiceUnavailableException(
        'Delivery is not available for the selected commune',
      );
    }

    if (
      deliveryType === 'office' &&
      !commune.hasStopDesk
    ) {
      throw new ServiceUnavailableException(
        'Stop-desk delivery is not available for the selected commune',
      );
    }

    const fromWilayaCode =
      this.getFromWilayaCode();

    const fees = await this.getFees(
      fromWilayaCode,
      toWilayaCode,
    );

    const rateKeys =
      deliveryType === 'office'
        ? [
            'express_stopdesk',
            'express_stop_desk',
            'expressStopDesk',
            'express_stopdesk_price',
            'stopdesk',
            'stop_desk',
            'stopDesk',
            'stop_desk_price',
            'office',
            'office_delivery',
            'desk',
          ]
        : [
            'express_home',
            'expressHome',
            'home',
            'home_delivery',
          ];

    const amountDa = this.findCommuneFeeAmount(
      fees,
      communeId,
      rateKeys,
    );

    if (
      amountDa == null ||
      !Number.isFinite(amountDa) ||
      amountDa < 0
    ) {
      if (deliveryType === 'office') {
        let diagnosticPayload = '';

        try {
          diagnosticPayload = JSON.stringify(fees);
        } catch {
          diagnosticPayload = '[unable to serialize Yalidine fees payload]';
        }

        this.logger.error(
          `YALIDINE_FEES_DIAGNOSTIC communeId=${communeId} fromWilaya=${fromWilayaCode} toWilaya=${toWilayaCode} payload=${diagnosticPayload.slice(0, 20000)}`,
        );
      }

      throw new ServiceUnavailableException(
        `Yalidine did not return a valid ${
          deliveryType === 'home'
            ? 'home'
            : 'stop-desk'
        } delivery fee for the selected commune`,
      );
    }

    return {
      amountCents: Math.round(amountDa * 100),
      currency: 'DZD',
      estimate: commune.deliveryTime,
    };
  }

  /**
   * Wilayas are now loaded from Yalidine instead of being exposed from the
   * hard-coded local list. The local list is retained only for synchronous
   * internal name lookup used elsewhere in the current backend.
   */
  async getWilayas(): Promise<YalidineWilaya[]> {
    const cached = this.getCache(
      this.wilayasCache,
    );

    if (cached) {
      return cached;
    }

    const rawItems = await this.fetchAllPages(
      'wilayas',
    );

    const wilayas = rawItems
      .map((item) => this.mapWilaya(item))
      .filter(
        (
          item,
        ): item is YalidineWilaya => item !== null,
      )
      .sort((a, b) => a.code - b.code);

    if (wilayas.length === 0) {
      throw new ServiceUnavailableException(
        'Yalidine returned no wilayas',
      );
    }

    this.wilayasCache = this.makeCache(
      wilayas,
      LOCATION_CACHE_TTL_MS,
    );

    return wilayas;
  }

  /**
   * Returns Yalidine communes for one courier wilaya.
   *
   * The response intentionally exposes only the fields the storefront needs.
   */
  async getCommunes(
    wilayaCode: number,
  ): Promise<YalidineCommune[]> {
    this.assertWilayaCode(wilayaCode);

    const cached = this.getCache(
      this.communesCache.get(wilayaCode) ??
        null,
    );

    if (cached) {
      return cached;
    }

    const rawItems = await this.fetchAllPages(
      'communes',
      {
        wilaya_id: wilayaCode,
      },
    );

    const communes = rawItems
      .map((item) =>
        this.mapCommune(item, wilayaCode),
      )
      .filter(
        (
          item,
        ): item is YalidineCommune =>
          item !== null,
      )
      .sort((a, b) =>
        a.name.localeCompare(b.name, 'fr'),
      );

    this.communesCache.set(
      wilayaCode,
      this.makeCache(
        communes,
        LOCATION_CACHE_TTL_MS,
      ),
    );

    return communes;
  }

  /**
   * Existing synchronous helpers are kept because other backend services
   * already use them. Checkout destination lists themselves now come from
   * Yalidine through getWilayas()/getCommunes().
   */
  getWilayaByCode(wilayaCode: number) {
    this.assertWilayaCode(wilayaCode);

    const wilaya = WILAYAS.find(
      (item) => item.code === wilayaCode,
    );

    if (!wilaya) {
      throw new BadRequestException(
        `Unknown wilaya code ${wilayaCode}`,
      );
    }

    return wilaya;
  }

  getWilayaName(wilayaCode: number): string {
    return this.getWilayaByCode(wilayaCode).name;
  }

  private async getFees(
    fromWilayaCode: number,
    toWilayaCode: number,
  ): Promise<unknown> {
    const cacheKey = `${fromWilayaCode}:${toWilayaCode}`;

    const cached = this.getCache(
      this.feesCache.get(cacheKey) ?? null,
    );

    if (cached !== null) {
      return cached;
    }

    const payload = await this.yalidineGet(
      'fees',
      {
        from_wilaya_id: fromWilayaCode,
        to_wilaya_id: toWilayaCode,
      },
    );

    this.feesCache.set(
      cacheKey,
      this.makeCache(
        payload,
        FEES_CACHE_TTL_MS,
      ),
    );

    return payload;
  }

  private async fetchAllPages(
    path: string,
    params: Record<
      string,
      string | number | boolean
    > = {},
  ): Promise<unknown[]> {
    const all: unknown[] = [];
    let page = 1;

    while (page <= MAX_PAGES) {
      const payload = await this.yalidineGet(
        path,
        {
          ...params,
          page,
          page_size: PAGE_SIZE,
        },
      );

      const items =
        this.extractCollection(payload);

      all.push(...items);

      const pagination =
        this.readPagination(payload);

      if (pagination.hasMore === false) {
        break;
      }

      if (
        pagination.hasMore == null &&
        items.length < PAGE_SIZE
      ) {
        break;
      }

      if (items.length === 0) {
        break;
      }

      page += 1;
    }

    return all;
  }

  private async yalidineGet(
    path: string,
    params: Record<
      string,
      string | number | boolean
    > = {},
  ): Promise<unknown> {
    const {
      apiId,
      apiToken,
      baseUrl,
      timeoutMs,
    } = this.getYalidineConfig();

    const url = new URL(
      `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`,
    );

    Object.entries(params).forEach(
      ([key, value]) => {
        url.searchParams.set(
          key,
          String(value),
        );
      },
    );

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      timeoutMs,
    );

    try {
      const response = await fetch(
        url.toString(),
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'X-API-ID': apiId,
            'X-API-TOKEN': apiToken,
          },
          signal: controller.signal,
        },
      );

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        this.logger.error(
          `Yalidine authentication failed (${response.status})`,
        );

        throw new ServiceUnavailableException(
          'Yalidine authentication failed',
        );
      }

      if (response.status === 429) {
        this.logger.warn(
          'Yalidine rate limit reached',
        );

        throw new ServiceUnavailableException(
          'Yalidine is temporarily busy. Please try again.',
        );
      }

      if (!response.ok) {
        const responseText =
          await response.text().catch(
            () => '',
          );

        this.logger.error(
          `Yalidine request failed: GET ${url.pathname} (${response.status})${
            responseText
              ? ` - ${responseText.slice(0, 500)}`
              : ''
          }`,
        );

        throw new ServiceUnavailableException(
          'Unable to retrieve delivery data from Yalidine',
        );
      }

      try {
        return (await response.json()) as unknown;
      } catch {
        this.logger.error(
          `Yalidine returned invalid JSON for GET ${url.pathname}`,
        );

        throw new ServiceUnavailableException(
          'Yalidine returned an invalid response',
        );
      }
    } catch (error) {
      if (
        error instanceof
        ServiceUnavailableException
      ) {
        throw error;
      }

      if (
        error instanceof Error &&
        error.name === 'AbortError'
      ) {
        this.logger.error(
          `Yalidine request timed out: GET ${url.pathname}`,
        );

        throw new ServiceUnavailableException(
          'Yalidine request timed out',
        );
      }

      this.logger.error(
        `Yalidine request error: GET ${url.pathname}`,
        error,
      );

      throw new ServiceUnavailableException(
        'Unable to contact Yalidine',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private getYalidineConfig() {
    const apiId = this.configService
      .get<string>('YALIDINE_API_ID')
      ?.trim();

    const apiToken = this.configService
      .get<string>('YALIDINE_API_TOKEN')
      ?.trim();

    if (!apiId || !apiToken) {
      throw new ServiceUnavailableException(
        'Yalidine credentials are not configured on the server',
      );
    }

    const baseUrl =
      this.configService
        .get<string>('YALIDINE_BASE_URL')
        ?.trim() ||
      'https://api.yalidine.app/v1';

    const timeoutMs =
      this.configService.get<number>(
        'YALIDINE_REQUEST_TIMEOUT_MS',
      ) ?? 10000;

    return {
      apiId,
      apiToken,
      baseUrl,
      timeoutMs,
    };
  }

  private getFromWilayaCode(): number {
    const value =
      this.configService.get<number>(
        'DELIVERY_FROM_WILAYA',
      ) ?? 16;

    this.assertWilayaCode(value);

    return value;
  }

  private mapWilaya(
    value: unknown,
  ): YalidineWilaya | null {
    const item = this.asRecord(value);

    if (!item) {
      return null;
    }

    const code = this.readFirstInteger(
      item,
      ['id', 'wilaya_id', 'code'],
    );

    const name = this.readFirstString(
      item,
      ['name', 'wilaya_name'],
    );

    if (
      code == null ||
      code < 1 ||
      code > 58 ||
      !name
    ) {
      return null;
    }

    const available =
      this.readFirstBoolean(
        item,
        [
          'is_deliverable',
          'deliverable',
          'available',
          'is_active',
        ],
      ) ?? true;

    return {
      code,
      name,
      available,
      homeAvailable: available,
      // Stop-desk availability is commune-specific. We do not invent a
      // wilaya-level value here.
      officeAvailable: false,
    };
  }

  private mapCommune(
    value: unknown,
    expectedWilayaCode: number,
  ): YalidineCommune | null {
    const item = this.asRecord(value);

    if (!item) {
      return null;
    }

    const id = this.readFirstInteger(
      item,
      ['id', 'commune_id'],
    );

    const name = this.readFirstString(
      item,
      ['name', 'commune_name'],
    );

    const returnedWilayaCode =
      this.readFirstInteger(item, [
        'wilaya_id',
        'wilayaId',
      ]);

    if (
      id == null ||
      id <= 0 ||
      !name ||
      (returnedWilayaCode != null &&
        returnedWilayaCode !==
          expectedWilayaCode)
    ) {
      return null;
    }

    const available =
      this.readFirstBoolean(
        item,
        [
          'is_deliverable',
          'deliverable',
          'available',
          'is_active',
        ],
      ) ?? true;

    const hasStopDesk =
      this.readFirstBoolean(
        item,
        [
          'has_stop_desk',
          'has_stopdesk',
          'hasStopDesk',
        ],
      ) ?? false;

    const deliveryTime =
      this.readDeliveryTime(item);

    return {
      id,
      name,
      wilayaCode: expectedWilayaCode,
      available,
      hasStopDesk,
      deliveryTime,
    };
  }

  private readDeliveryTime(
    item: Record<string, unknown>,
  ): string | null {
    const raw =
      item.delivery_time_parcel ??
      item.deliveryTimeParcel ??
      item.delivery_time;

    if (
      typeof raw === 'string' &&
      raw.trim()
    ) {
      return raw.trim();
    }

    if (
      typeof raw === 'number' &&
      Number.isFinite(raw)
    ) {
      return `${raw} jour${raw === 1 ? '' : 's'}`;
    }

    return null;
  }

  /**
   * Find one exact Yalidine rate for one commune.
   *
   * Important: do NOT first select a generic "commune fee object" based on
   * any recognised price. A Yalidine response can wrap home and stop-desk
   * prices at different nesting levels. The previous implementation could
   * therefore stop on a home-only node and never reach express_stopdesk.
   *
   * We now search specifically for the requested rate keys, but only inside
   * the branch that belongs to the requested commune.
   */
  private findCommuneFeeAmount(
    payload: unknown,
    communeId: number,
    rateKeys: string[],
  ): number | null {
    const visited = new Set<object>();

    const findRateDeep = (
      value: unknown,
      rateVisited = new Set<object>(),
    ): number | null => {
      if (
        value === null ||
        value === undefined
      ) {
        return null;
      }

      if (Array.isArray(value)) {
        if (rateVisited.has(value)) {
          return null;
        }

        rateVisited.add(value);

        for (const item of value) {
          const found = findRateDeep(
            item,
            rateVisited,
          );

          if (found != null) {
            return found;
          }
        }

        return null;
      }

      const record = this.asRecord(value);

      if (!record) {
        return null;
      }

      if (rateVisited.has(record)) {
        return null;
      }

      rateVisited.add(record);

      const direct = this.readFirstNumber(
        record,
        rateKeys,
      );

      if (direct != null) {
        return direct;
      }

      for (const nested of Object.values(
        record,
      )) {
        const found = findRateDeep(
          nested,
          rateVisited,
        );

        if (found != null) {
          return found;
        }
      }

      return null;
    };

    const visit = (value: unknown): number | null => {
      if (
        value === null ||
        value === undefined
      ) {
        return null;
      }

      if (Array.isArray(value)) {
        if (visited.has(value)) {
          return null;
        }

        visited.add(value);

        for (const item of value) {
          const found = visit(item);

          if (found != null) {
            return found;
          }
        }

        return null;
      }

      const record = this.asRecord(value);

      if (!record) {
        return null;
      }

      if (visited.has(record)) {
        return null;
      }

      visited.add(record);

      // Common Yalidine shape: the commune id itself is an object key.
      const keyedCommune =
        record[String(communeId)];

      if (keyedCommune !== undefined) {
        const found = findRateDeep(
          keyedCommune,
        );

        if (found != null) {
          return found;
        }
      }

      // Other Yalidine shape: each commune row contains commune_id.
      const recordCommuneId =
        this.readFirstInteger(record, [
          'commune_id',
          'communeId',
          'id',
        ]);

      if (recordCommuneId === communeId) {
        const found = findRateDeep(record);

        if (found != null) {
          return found;
        }
      }

      for (const nested of Object.values(
        record,
      )) {
        const found = visit(nested);

        if (found != null) {
          return found;
        }
      }

      return null;
    };

    return visit(payload);
  }

  private extractCollection(
    payload: unknown,
  ): unknown[] {
    if (Array.isArray(payload)) {
      return payload;
    }

    const record = this.asRecord(payload);

    if (!record) {
      return [];
    }

    const candidates = [
      record.data,
      record.items,
      record.results,
      record.wilayas,
      record.communes,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }

      const nested =
        this.asRecord(candidate);

      if (
        nested &&
        Array.isArray(nested.data)
      ) {
        return nested.data;
      }
    }

    return [];
  }

  private readPagination(payload: unknown): {
    hasMore: boolean | null;
  } {
    const record = this.asRecord(payload);

    if (!record) {
      return {
        hasMore: null,
      };
    }

    const explicit =
      this.readFirstBoolean(record, [
        'has_more',
        'hasMore',
      ]);

    if (explicit != null) {
      return {
        hasMore: explicit,
      };
    }

    const currentPage =
      this.readFirstInteger(record, [
        'current_page',
        'page',
      ]);

    const totalPages =
      this.readFirstInteger(record, [
        'total_pages',
        'last_page',
      ]);

    if (
      currentPage != null &&
      totalPages != null
    ) {
      return {
        hasMore:
          currentPage < totalPages,
      };
    }

    if (
      typeof record.next === 'string'
    ) {
      return {
        hasMore: record.next.trim() !== '',
      };
    }

    if (record.next === null) {
      return {
        hasMore: false,
      };
    }

    const links = this.asRecord(
      record.links,
    );

    if (links) {
      if (
        typeof links.next === 'string'
      ) {
        return {
          hasMore:
            links.next.trim() !== '',
        };
      }

      if (links.next === null) {
        return {
          hasMore: false,
        };
      }
    }

    return {
      hasMore: null,
    };
  }

  private asRecord(
    value: unknown,
  ): Record<string, unknown> | null {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      return null;
    }

    return value as Record<
      string,
      unknown
    >;
  }

  private readFirstString(
    record: Record<string, unknown>,
    keys: string[],
  ): string | null {
    for (const key of keys) {
      const value = record[key];

      if (
        typeof value === 'string' &&
        value.trim()
      ) {
        return value.trim();
      }
    }

    return null;
  }

  private readFirstInteger(
    record: Record<string, unknown>,
    keys: string[],
  ): number | null {
    const value =
      this.readFirstNumber(record, keys);

    if (
      value == null ||
      !Number.isInteger(value)
    ) {
      return null;
    }

    return value;
  }

  private readFirstNumber(
    record: Record<string, unknown>,
    keys: string[],
  ): number | null {
    for (const key of keys) {
      const value = record[key];

      if (
        typeof value === 'number' &&
        Number.isFinite(value)
      ) {
        return value;
      }

      if (
        typeof value === 'string' &&
        value.trim() !== ''
      ) {
        const parsed = Number(
          value.trim().replace(',', '.'),
        );

        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return null;
  }

  private readFirstBoolean(
    record: Record<string, unknown>,
    keys: string[],
  ): boolean | null {
    for (const key of keys) {
      const value = record[key];

      if (typeof value === 'boolean') {
        return value;
      }

      if (value === 1 || value === '1') {
        return true;
      }

      if (value === 0 || value === '0') {
        return false;
      }

      if (typeof value === 'string') {
        const normalized =
          value.trim().toLowerCase();

        if (
          normalized === 'true' ||
          normalized === 'yes'
        ) {
          return true;
        }

        if (
          normalized === 'false' ||
          normalized === 'no'
        ) {
          return false;
        }
      }
    }

    return null;
  }

  private makeCache<T>(
    value: T,
    ttlMs: number,
  ): CacheEntry<T> {
    return {
      expiresAt: Date.now() + ttlMs,
      value,
    };
  }

  private getCache<T>(
    entry: CacheEntry<T> | null,
  ): T | null {
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      return null;
    }

    return entry.value;
  }

  /**
   * Temporary compatibility path only.
   * It will be removed once controller + checkout + order creation all send
   * the selected Yalidine commune id.
   */
  private async calculateLegacyRate(
    toWilayaCode: number,
    deliveryType: DeliveryType,
  ): Promise<DeliveryRate> {
    if (deliveryType === 'office') {
      throw new ServiceUnavailableException(
        'Office delivery is temporarily unavailable',
      );
    }

    const rates =
      this.getConfiguredLegacyRates();

    const wilayaRate =
      rates[String(toWilayaCode)];

    if (!wilayaRate) {
      throw new ServiceUnavailableException(
        `Delivery rate is not configured for wilaya ${toWilayaCode}`,
      );
    }

    const amountCents =
      wilayaRate.home;

    if (
      !this.isValidLegacyRate(
        amountCents,
      )
    ) {
      throw new ServiceUnavailableException(
        `Delivery rate is not configured for home delivery in wilaya ${toWilayaCode}`,
      );
    }

    return {
      amountCents,
      currency: 'DZD',
      estimate:
        wilayaRate.estimate?.trim() ||
        null,
    };
  }

  private getConfiguredLegacyRates(): DeliveryRatesConfig {
    const raw = this.configService
      .get<string>('DELIVERY_RATES_JSON')
      ?.trim();

    if (!raw) {
      throw new ServiceUnavailableException(
        'A commune must be selected before calculating the Yalidine delivery rate',
      );
    }

    try {
      const parsed = JSON.parse(
        raw,
      ) as unknown;

      if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
      ) {
        throw new Error(
          'Invalid object',
        );
      }

      return parsed as DeliveryRatesConfig;
    } catch (error) {
      this.logger.error(
        'Invalid DELIVERY_RATES_JSON configuration',
        error,
      );

      throw new ServiceUnavailableException(
        'Legacy delivery rates configuration is invalid',
      );
    }
  }

  private isValidLegacyRate(
    amountCents: number | undefined,
  ): amountCents is number {
    return (
      Number.isInteger(amountCents) &&
      (amountCents ?? -1) >= 0
    );
  }

  private assertWilayaCode(
    wilayaCode: number,
  ): void {
    if (
      !Number.isInteger(wilayaCode) ||
      wilayaCode < 1 ||
      wilayaCode > 58
    ) {
      throw new BadRequestException(
        'Wilaya code must be between 1 and 58',
      );
    }
  }
}
