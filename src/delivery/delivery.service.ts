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

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private readonly configService: ConfigService,
  ) {}

  /**
   * Authoritative server-side delivery pricing.
   *
   * Rates come from DELIVERY_RATES_JSON.
   * We intentionally do not provide invented fallback prices.
   */
  async calculateRate(
    toWilayaCode: number,
    deliveryType: DeliveryType = 'home',
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

    // Stop-desk / office delivery stays disabled until we have
    // an authoritative carrier dataset (for example Yalidine).
    if (deliveryType === 'office') {
      throw new ServiceUnavailableException(
        'Office delivery is temporarily unavailable',
      );
    }

    const rates = this.getConfiguredRates();
    const wilayaRate = rates[String(toWilayaCode)];

    if (!wilayaRate) {
      throw new ServiceUnavailableException(
        `Delivery rate is not configured for wilaya ${toWilayaCode}`,
      );
    }

    const amountCents = wilayaRate.home;

    if (!this.isValidRate(amountCents)) {
      throw new ServiceUnavailableException(
        `Delivery rate is not configured for home delivery in wilaya ${toWilayaCode}`,
      );
    }

    return {
      amountCents,
      currency: 'DZD',
      estimate: wilayaRate.estimate?.trim() || null,
    };
  }

  /**
   * Return all 58 wilayas and tell the frontend which ones can
   * currently be used for checkout.
   */
  async getWilayas() {
    const rates = this.getConfiguredRates();

    return WILAYAS.map((wilaya) => {
      const wilayaRate = rates[String(wilaya.code)];
      const homeAvailable = this.isValidRate(
        wilayaRate?.home,
      );

      return {
        ...wilaya,
        available: homeAvailable,
        homeAvailable,
        officeAvailable: false,
      };
    });
  }

  /**
   * Returns the server-authoritative wilaya for a code.
   * Checkout can use this instead of trusting a client-provided name.
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

  /**
   * Communes are intentionally not fabricated here.
   * This method will later use the authoritative delivery/CRM dataset.
   */
  async getCommunes(wilayaCode: number) {
    this.assertWilayaCode(wilayaCode);

    return [];
  }

  private getConfiguredRates(): DeliveryRatesConfig {
    const raw = this.configService
      .get<string>('DELIVERY_RATES_JSON')
      ?.trim();

    if (!raw) {
      throw new ServiceUnavailableException(
        'Delivery rates are not configured on the server',
      );
    }

    try {
      const parsed = JSON.parse(raw) as unknown;

      if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
      ) {
        throw new Error('Invalid object');
      }

      return parsed as DeliveryRatesConfig;
    } catch (error) {
      this.logger.error(
        'Invalid DELIVERY_RATES_JSON configuration',
        error,
      );

      throw new ServiceUnavailableException(
        'Delivery rates configuration is invalid',
      );
    }
  }

  private isValidRate(
    amountCents: number | undefined,
  ): amountCents is number {
    return (
      Number.isInteger(amountCents) &&
      (amountCents ?? -1) >= 0
    );
  }

  private assertWilayaCode(wilayaCode: number): void {
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
