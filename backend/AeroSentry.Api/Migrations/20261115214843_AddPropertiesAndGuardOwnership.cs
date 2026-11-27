using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AeroSentry.Api.Migrations;

/// <inheritdoc />
public partial class _20261115214843_AddPropertiesAndGuardOwnership : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(
            name: "OwnerAdminId",
            table: "Users",
            type: "uniqueidentifier",
            nullable: true);

        migrationBuilder.CreateTable(
            name: "Properties",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                OwnerAdminId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                Address = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                Latitude = table.Column<double>(type: "float", nullable: true),
                Longitude = table.Column<double>(type: "float", nullable: true),
                CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Properties", x => x.Id);
                table.ForeignKey(
                    name: "FK_Properties_Users_OwnerAdminId",
                    column: x => x.OwnerAdminId,
                    principalTable: "Users",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateTable(
            name: "PropertyGuards",
            columns: table => new
            {
                PropertyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                GuardId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                AssignedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_PropertyGuards", x => new { x.PropertyId, x.GuardId });
                table.ForeignKey(
                    name: "FK_PropertyGuards_Properties_PropertyId",
                    column: x => x.PropertyId,
                    principalTable: "Properties",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_PropertyGuards_Users_GuardId",
                    column: x => x.GuardId,
                    principalTable: "Users",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_Users_OwnerAdminId",
            table: "Users",
            column: "OwnerAdminId");

        migrationBuilder.CreateIndex(
            name: "IX_Properties_OwnerAdminId",
            table: "Properties",
            column: "OwnerAdminId");

        migrationBuilder.CreateIndex(
            name: "IX_PropertyGuards_GuardId",
            table: "PropertyGuards",
            column: "GuardId");

        migrationBuilder.AddForeignKey(
            name: "FK_Users_Users_OwnerAdminId",
            table: "Users",
            column: "OwnerAdminId",
            principalTable: "Users",
            principalColumn: "Id",
            onDelete: ReferentialAction.Restrict);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey(
            name: "FK_Users_Users_OwnerAdminId",
            table: "Users");

        migrationBuilder.DropTable(
            name: "PropertyGuards");

        migrationBuilder.DropTable(
            name: "Properties");

        migrationBuilder.DropIndex(
            name: "IX_Users_OwnerAdminId",
            table: "Users");

        migrationBuilder.DropColumn(
            name: "OwnerAdminId",
            table: "Users");
    }
}
