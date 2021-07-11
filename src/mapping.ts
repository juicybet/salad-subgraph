import { Address, BigInt, ethereum } from '@graphprotocol/graph-ts'
import {
  Salad,
  Claimed,
  IngredientAdded,
  IngredientIncreased,
  SaladBowlCreated,
  SaladPrepared,
  SaladServed
} from '../generated/Salad/Salad'
import { SaladBet, SaladBowl, Transaction } from '../generated/schema'

enum SaladStatus {
  BowlCreated,
  Prepared,
  Served
}

let tenK = BigInt.fromI32(10000)
let zero = BigInt.fromI32(0)
let zeroAddress = Address.fromString('0x' + '0'.repeat(40))

function createTx(event: ethereum.Event): string {
  let tx = new Transaction(event.transaction.hash.toHex())
  tx.block = event.block.number
  tx.timestamp = event.block.timestamp
  tx.save()

  return tx.id
}

export function handleSaladBowlCreated(event: SaladBowlCreated): void {
  let saladBowl = new SaladBowl(event.params.id.toHex())

  saladBowl.expiresOn = event.params.expiresOn.toI32()
  saladBowl.status = SaladStatus.BowlCreated
  saladBowl.createdTx = createTx(event)
  saladBowl.betSum = new Array<BigInt>(6)

  saladBowl.save()
}

export function handleIngredientAdded(event: IngredientAdded): void {
  let saladId = event.params.id.toHex()
  let saladBowl = SaladBowl.load(saladId)
  let saladBet = new SaladBet(saladId + '_' + event.params.creator.toHex())
  let salad = Salad.bind(event.address)
  let maxBet = SaladBet.load(saladBowl.maxBet)

  saladBet.salad = saladId
  saladBet.bet = event.params.bet
  saladBet.bet2 = event.params.bet2
  saladBet.value = event.params.value
  saladBet.creator = event.params.creator

  saladBet.createdTx = createTx(event)

  if ((maxBet != null && saladBet.value.ge(maxBet.value)) || maxBet == null) {
    saladBowl.maxBet = saladBet.id
  }

  let sum = new Array<BigInt>(6)
  for (let i = 0; i < 6; i++) {
    sum[i] = salad.betSum(event.params.id, i)
  }

  saladBowl.betSum = sum

  saladBowl.save()
  saladBet.save()
}

export function handleIngredientIncreased(event: IngredientIncreased): void {
  let saladId = event.params.id.toHex()
  let saladBowl = SaladBowl.load(saladId)
  let saladBet = SaladBet.load(saladId + '_' + event.params.creator.toHex())
  let salad = Salad.bind(event.address)
  let maxBet = SaladBet.load(saladBowl.maxBet)

  saladBet.value = event.params.newValue
  saladBet.increasedTx = saladBet.increasedTx || []
  saladBet.increasedTx.push(createTx(event))

  if ((maxBet != null && saladBet.value.ge(maxBet.value)) || maxBet == null) {
    saladBowl.maxBet = saladBet.id
  }

  let sum = new Array<BigInt>(6)
  for (let i = 0; i < 6; i++) {
    sum[i] = salad.betSum(event.params.id, i)
  }

  saladBowl.betSum = sum

  saladBowl.save()
  saladBet.save()
}

export function handleSaladPrepared(event: SaladPrepared): void {
  let saladId = event.params.id.toHex()
  let saladBowl = SaladBowl.load(saladId)

  saladBowl.status = SaladStatus.Prepared
  saladBowl.preparedTx = createTx(event)

  saladBowl.save()
}

export function handleSaladServed(event: SaladServed): void {
  let saladId = event.params.id.toHex()
  let saladBowl = SaladBowl.load(saladId)
  let maxBet = SaladBet.load(saladBowl.maxBet)

  saladBowl.status = SaladStatus.Served
  saladBowl.result = event.params.result
  saladBowl.servedTx = createTx(event)

  saladBowl.jackpot = maxBet != null && maxBet.bet2 == saladBowl.result

  saladBowl.save()
}

export function handleClaimed(event: Claimed): void {
  let saladId = event.params.id.toHex()
  let saladBowl = SaladBowl.load(saladId)
  let saladBet = SaladBet.load(saladId + '_' + event.params.creator.toHex())
  let salad = Salad.bind(event.address)
  let maxBet = SaladBet.load(saladBowl.maxBet)

  saladBet.claimedTx = createTx(event)

  let hasReferrer = !event.params.referrer.equals(zeroAddress)
  let referralBonus = hasReferrer ? saladBet.value.times(BigInt.fromI32(salad.referralRate())).div(tenK) : zero
  let feeDeducted = saladBet.value
    .times(BigInt.fromI32(salad.commissionRate()))
    .div(tenK)
    .minus(referralBonus)

  saladBet.referralBonus = referralBonus
  saladBet.feeDeducted = feeDeducted
  saladBet.rewardReceived = saladBet.value.minus(feeDeducted).minus(referralBonus)

  saladBet.wonJackpot = maxBet.id == saladBet.id

  saladBet.save()
}
