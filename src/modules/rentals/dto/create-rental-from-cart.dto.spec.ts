import { RentalDeliveryMethod } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRentalFromCartDto } from './create-rental-from-cart.dto';

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    applicantName: 'Cliente CEMYDI',
    applicantEmail: 'cliente@cemydi.test',
    applicantPhone: '555 123 4567',
    isForAnotherPerson: false,
    deliveryMethod: RentalDeliveryMethod.PICKUP,
    acceptRentalTerms: true,
    acceptPrivacy: true,
    ...overrides,
  };
}

async function errorsFor(payload: Record<string, unknown>) {
  return validate(plainToInstance(CreateRentalFromCartDto, payload));
}

describe('CreateRentalFromCartDto', () => {
  it('accepts pickup requirements with both consents', async () => {
    await expect(errorsFor(validPayload())).resolves.toHaveLength(0);
  });

  it('requires the complete address for home delivery', async () => {
    const errors = await errorsFor(
      validPayload({ deliveryMethod: RentalDeliveryMethod.HOME_DELIVERY }),
    );

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'deliveryAddress',
        'deliveryNeighborhood',
        'deliveryPostalCode',
        'deliveryMunicipality',
      ]),
    );
  });

  it('requires the patient name and relationship for another person', async () => {
    const errors = await errorsFor(validPayload({ isForAnotherPerson: true }));

    expect(errors.map((error) => error.property)).toContain('patientName');
    expect(errors.map((error) => error.property)).toContain(
      'patientRelationship',
    );
  });

  it('requires a custom relationship when selecting Otro', async () => {
    const errors = await errorsFor(
      validPayload({
        isForAnotherPerson: true,
        patientName: 'Paciente CEMYDI',
        patientRelationship: 'Otro',
      }),
    );

    expect(errors.map((error) => error.property)).toContain(
      'patientRelationshipOther',
    );
  });

  it('rejects either missing consent', async () => {
    const errors = await errorsFor(
      validPayload({ acceptRentalTerms: false, acceptPrivacy: false }),
    );

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['acceptRentalTerms', 'acceptPrivacy']),
    );
  });
});
