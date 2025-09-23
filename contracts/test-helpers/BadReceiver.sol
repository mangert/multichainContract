// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./../Auction.sol";

/**
 * @title BadReceiver  
 * @notice примитивный контракт, который отклоняет поступления средств - для проведения тестов 
 * на "неуспешные" перечисления средств
 */
contract BadReceiver {

    bool shouldNotRevert; //флаг, определяющий поведение контракта - отклонять или принимать средства

    function getTransfer() external payable{} //функция для пополнения контракта


    function  getBalance() external view returns(uint256) { //возвращаем баланс
        return address(this).balance;
    }    

    /**
     * @notice функция для вывода зависшей сдачи с контракта-аукциона
     * @param auction - адрес контракта
     */
    function callWithdrawRefund(address auction) external payable {
        
        (bool success, ) = auction.call(abi.encodeCall(Auction.withdrawPending, ()));
        require(success, "Withdraw error");        
    }

    /**
     * @notice функция для вывода дохода владельцем
     * @param auction - адрес контракта
     * @param amount - сумма вывода
     */
    function callWithdrawIncome(address auction, uint64 amount) external payable {
        
        (bool success, ) = auction.call(abi.encodeCall(Auction.withdrawIncomes, (amount)));
        require(success, "Withdraw error");        
    }

    /**
     * @notice функция для вызова покупки в контракте-аукционе
     * @param auction - адрес аукциона
     * @param price - цена, за которую покупаем
     * @param index - идентификатор покупаемого лота
     */
    function callBuy(address auction, uint256 price, uint256 index) external {
        
        (bool success, ) = auction.call{ value: price }(abi.encodeCall(Auction.buy,(index)));
        require(success, "Buy error");        
    }

    /**
     * @notice функция установки возможности получения контрактом средств
     * @param state - устанавливаемое значение флага
     */
    function setRevertFlag(bool state) public {
        shouldNotRevert = state;
    }
    
    receive() external payable { //отклоняем все поступления, если флаг false
        if(!shouldNotRevert) {
            revert("Reject all ETH");
        }
        
    }
}
